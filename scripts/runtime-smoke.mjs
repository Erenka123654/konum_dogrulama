import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { passwordHash } from '../checkin-backend/src/crypto.js';
const root = new URL('../', import.meta.url);
const key = '34'.repeat(32);
const mf = new Miniflare(convertV4MiniflareOptions({
  compatibilityDate: '2026-09-14',
  modules: ['index.js','crypto.js'].map(name => ({ type: 'ESModule', path: name, contents: readFileSync(new URL(`checkin-backend/src/${name}`, root), 'utf8') })),
  d1Databases: ['DB'], bindings: { DEVICE_KEYS: JSON.stringify({ SUBE_1: { key, name: 'Runtime test' } }) }
}));
try {
  const db = await mf.getD1Database('DB');
  const sql = readFileSync(new URL('checkin-backend/migrations/0001_secure_checkin.sql', root), 'utf8').replace(/--[^\n]*/g, '');
  for (const statement of sql.split(';').filter(s => s.trim())) await db.prepare(statement).run();
  const salt = '56'.repeat(16), hash = await passwordHash('runtime-password-123', salt);
  await db.prepare("INSERT INTO staff(id,username,display_name,password_hash,salt,role,must_change,created_at) VALUES ('test','test','Test',?,?,'staff',0,0)").bind(hash, salt).run();
  let cookie = '';
  async function call(path, data) {
    const response = await mf.dispatchFetch('https://runtime.test' + path, { method: 'POST', headers: { Origin: 'https://runtime.test', 'Content-Type':'application/json', Cookie: cookie }, body: JSON.stringify(data) });
    if (response.headers.has('Set-Cookie')) cookie = response.headers.get('Set-Cookie').split(';')[0];
    const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result)); return result;
  }
  await call('/api/login', { username: 'test', password: 'runtime-password-123' });
  const c = await call('/api/challenge', { locationId:'SUBE_1', action:'in' });
  const proof = createHmac('sha256', Buffer.from(key,'hex')).update(`checkin-v2|SUBE_1|${c.nonce}`).digest('hex');
  await call('/api/checkin', { challengeId:c.challengeId, proof });
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM verified_checkins').first()).count, 1);
  console.log('Cloudflare workerd + D1 smoke test passed: login, PBKDF2, challenge, HMAC, atomic record.');
} finally { await mf.dispose(); }
