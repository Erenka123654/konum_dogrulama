import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import worker from '../checkin-backend/src/index.js';
import { passwordHash, sha256, verifyProof } from '../checkin-backend/src/crypto.js';

const secret = 'ab'.repeat(32); // Test-only value, never provisioned.
const origin = 'https://test.example';
const signature = nonce => createHmac('sha256', Buffer.from(secret, 'hex')).update(`checkin-v2|SUBE_1|${nonce}`).digest('hex');
async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../checkin-backend/migrations/0001_secure_checkin.sql', import.meta.url), 'utf8'));
  const DB = {
    prepare(sql) {
      const statement = sqlite.prepare(sql); let args = [];
      const bound = {
        bind(...values) { args = values; return bound; },
        async first() { return statement.get(...args) || null; },
        async all() { return { results: statement.all(...args) }; },
        async run() { return { meta: { changes: statement.run(...args).changes } }; }
      }; return bound;
    },
    async batch(statements) { sqlite.exec('BEGIN'); try { const results = []; for (const s of statements) results.push(await s.run()); sqlite.exec('COMMIT'); return results; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } }
  };
  const hash = await passwordHash('test-password-123', '01'.repeat(16));
  for (const [id, role] of [['admin','admin'],['alice','staff'],['bob','staff']]) {
    sqlite.prepare('INSERT INTO staff(id,username,display_name,password_hash,salt,role,must_change,created_at) VALUES (?,?,?,?,?,?,0,0)').run(id,id,id,hash,'01'.repeat(16),role);
    sqlite.prepare('INSERT INTO sessions VALUES (?,?,?)').run(await sha256((id === 'alice' ? 'a' : id === 'bob' ? 'b' : 'c').repeat(64)), id, Math.floor(Date.now()/1000)+3600);
  }
  const env = { DB, DEVICE_KEYS: JSON.stringify({ SUBE_1: { key: secret, name: 'Test workplace' } }), ASSETS: { fetch: async () => new Response('demo') } };
  async function call(path, data, token = 'a'.repeat(64), customOrigin = origin) {
    const response = await worker.fetch(new Request(origin + path, { method: data === undefined ? 'GET' : 'POST',
      headers: { Cookie: `__Host-checkin=${token}`, Origin: customOrigin, 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) }), env);
    return { status: response.status, headers: response.headers, data: await response.json() };
  }
  return { sqlite, env, call };
}
test('valid proof records entry, rejects replay and supports exit', async () => {
  const { call, sqlite } = await fixture();
  const challenge = (await call('/api/challenge', { locationId: 'SUBE_1', action: 'in' })).data;
  const payload = { challengeId: challenge.challengeId, proof: signature(challenge.nonce) };
  assert.equal((await call('/api/checkin', payload)).status, 200);
  assert.equal((await call('/api/checkin', payload)).status, 409);
  const second = (await call('/api/challenge', { locationId: 'SUBE_1', action: 'in' })).data;
  assert.equal((await call('/api/checkin', { challengeId: second.challengeId, proof: signature(second.nonce) })).status, 409);
  const out = (await call('/api/challenge', { locationId: 'SUBE_1', action: 'out' })).data;
  assert.equal((await call('/api/checkin', { challengeId: out.challengeId, proof: signature(out.nonce) })).status, 200);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM verified_checkins').get().count, 2);
});
test('forged, expired and cross-session proofs fail closed', async () => {
  const { call, sqlite } = await fixture();
  const c = (await call('/api/challenge', { locationId: 'SUBE_1', action: 'in' })).data;
  assert.equal((await call('/api/checkin', { challengeId: c.challengeId, proof: '00'.repeat(32) })).status, 403);
  assert.equal((await call('/api/checkin', { challengeId: c.challengeId, proof: signature(c.nonce) }, 'b'.repeat(64))).status, 409);
  sqlite.prepare('UPDATE challenges SET expires_at=0').run();
  assert.equal((await call('/api/checkin', { challengeId: c.challengeId, proof: signature(c.nonce) })).status, 409);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM verified_checkins').get().count, 0);
});
test('legacy endpoints, unauthenticated requests and cross-origin mutations rejected', async () => {
  const { call } = await fixture();
  assert.equal((await call('/checkin', { employeeName: 'fake', locationId: 'SUBE_1' })).status, 410);
  assert.equal((await call('/checkins')).status, 410);
  assert.equal((await call('/api/checkins', undefined, '')).status, 401);
  assert.equal((await call('/api/challenge', { locationId: 'SUBE_1', action: 'in' }, 'a'.repeat(64), 'https://evil.example')).status, 403);
  assert.equal((await call('/api/admin/users')).status, 403);
  assert.equal((await call('/api/challenge', { locationId: 'UNKNOWN', action: 'in' })).status, 400);
});
test('personnel isolation, password reset and revocation', async () => {
  const { call, sqlite } = await fixture();
  const c = (await call('/api/challenge', { locationId: 'SUBE_1', action: 'in' })).data;
  await call('/api/checkin', { challengeId: c.challengeId, proof: signature(c.nonce) });
  assert.equal((await call('/api/checkins', undefined, 'b'.repeat(64))).data.checkins.length, 0);
  assert.equal((await call('/api/checkins', undefined, 'c'.repeat(64))).data.checkins.length, 1);
  assert.equal((await call('/api/admin/user', { id: 'alice', active: false }, 'c'.repeat(64))).status, 200);
  assert.equal((await call('/api/me')).status, 401);
  assert.equal(sqlite.prepare("SELECT active FROM staff WHERE id='alice'").get().active, 0);
});
test('login cookie and required password change', async () => {
  const { call, sqlite } = await fixture();
  sqlite.prepare("UPDATE staff SET must_change=1 WHERE id='alice'").run();
  assert.equal((await call('/api/challenge', { locationId: 'SUBE_1', action: 'in' })).status, 403);
  const login = await call('/api/login', { username: 'alice', password: 'test-password-123' });
  assert.equal(login.status, 200); assert.equal(login.data.user.mustChangePassword, true);
  assert.match(login.headers.get('Set-Cookie'), /HttpOnly; Secure; SameSite=Strict/);
  assert.equal((await call('/api/password', { currentPassword: 'test-password-123', newPassword: 'a-new-password-123' })).status, 200);
  assert.equal((await call('/api/me')).status, 401);
  assert.equal((await call('/api/login', { username: 'alice', password: 'a-new-password-123' })).status, 200);
});
test('rate limit and oversized body', async () => {
  const { call } = await fixture();
  for (let i=0; i<10; i++) assert.equal((await call('/api/challenge', { locationId: 'SUBE_1', action: 'in' })).status, 200);
  assert.equal((await call('/api/challenge', { locationId: 'SUBE_1', action: 'in' })).status, 429);
  assert.equal((await call('/api/login', { username: 'x'.repeat(5000) })).status, 413);
});
test('HMAC interoperates with independent Node crypto and binds location', async () => {
  const nonce = '12'.repeat(16);
  assert.equal(await verifyProof(secret, 'SUBE_1', nonce, signature(nonce)), true);
  assert.equal(await verifyProof(secret, 'SUBE_2', nonce, signature(nonce)), false);
});
