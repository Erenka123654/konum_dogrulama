import { randomHex, sha256, passwordHash, equal, verifyProof } from './crypto.js';
const COOKIE = '__Host-checkin';
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const now = () => Math.floor(Date.now() / 1000);
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers }
});
const cookie = (token, age) => `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
const publicUser = user => ({ id: user.id, username: user.username, name: user.display_name, role: user.role, mustChangePassword: Boolean(user.must_change) });

async function body(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) fail(415, 'JSON bekleniyor.');
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'İstek gövdesi eksik.');
  let size = 0; const chunks = [];
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > 4096) { await reader.cancel(); fail(413, 'İstek çok büyük.'); }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let data;
  try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch { fail(400, 'Geçersiz JSON.'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail(400, 'Geçersiz istek.');
  return data;
}
function text(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(400, `${label} geçersiz.`);
  return value.trim();
}
function password(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) fail(400, 'Şifre 12–128 karakter olmalı.');
  return value;
}
async function rate(env, key, limit, period = 60) {
  const time = now(); const bucket = await sha256(`${key}:${Math.floor(time / period)}`);
  const row = await env.DB.prepare(`INSERT INTO rate_limits(bucket,count,expires_at) VALUES (?,1,?)
    ON CONFLICT(bucket) DO UPDATE SET count=count+1 WHERE count < ? RETURNING count`)
    .bind(bucket, time + period * 2, limit).first();
  if (!row) fail(429, 'Çok fazla deneme. Bir süre sonra tekrar deneyin.');
}
async function session(request, env) {
  const token = (request.headers.get('Cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!/^[a-f0-9]{64}$/.test(token || '')) fail(401, 'Lütfen giriş yapın.');
  const hash = await sha256(token);
  const user = await env.DB.prepare(`SELECT staff.*, sessions.token_hash FROM sessions JOIN staff ON staff.id=sessions.user_id
    WHERE token_hash=? AND expires_at>? AND staff.active=1`).bind(hash, now()).first();
  if (!user) fail(401, 'Oturum sona erdi. Yeniden giriş yapın.');
  return user;
}
function device(env, id) {
  let entries;
  try { entries = JSON.parse(env.DEVICE_KEYS || '{}'); } catch { fail(503, 'Cihaz yapılandırması hazır değil.'); }
  if (!entries || Array.isArray(entries) || typeof entries !== 'object') fail(503, 'Cihaz yapılandırması hazır değil.');
  const config = Object.hasOwn(entries, id) ? entries[id] : null;
  if (!config || !/^[a-f0-9]{64}$/.test(config.key || '') || typeof config.name !== 'string') fail(400, 'Bu doğrulama cihazı kayıtlı değil.');
  return config;
}

async function route(request, env) {
  const url = new URL(request.url); const path = url.pathname; const method = request.method;
  if (path === '/checkin' || path === '/checkins') fail(410, 'Eski doğrulama kapatıldı. Yeni uygulamayı kullanın.');
  if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
  if (!env.DB) fail(503, 'Veritabanı hazır değil.');
  if (method !== 'GET' && request.headers.get('Origin') !== url.origin) fail(403, 'İstek kaynağı doğrulanamadı.');
  await rate(env, `ip:${request.headers.get('CF-Connecting-IP') || 'local'}`, 120);
  if (path === '/api/login' && method === 'POST') {
    const data = await body(request);
    const username = text(data.username, 64, 'Kullanıcı adı').toLowerCase();
    text(data.password, 128, 'Şifre');
    await rate(env, `login-ip:${request.headers.get('CF-Connecting-IP') || 'local'}`, 15, 900);
    await rate(env, `login-user:${username}`, 10, 900);
    const user = await env.DB.prepare('SELECT * FROM staff WHERE username=?').bind(username).first();
    const hash = await passwordHash(data.password, user?.salt || '00'.repeat(16));
    if (!user?.active || !equal(hash, user.password_hash)) fail(401, 'Kullanıcı adı veya şifre hatalı.');
    const token = randomHex(32);
    await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)').bind(await sha256(token), user.id, now() + 28800).run();
    return json({ ok: true, user: publicUser(user) }, 200, { 'Set-Cookie': cookie(token, 28800) });
  }
  const user = await session(request, env);
  if (path === '/api/me' && method === 'GET') return json({ ok: true, user: publicUser(user) });
  if (path === '/api/logout' && method === 'POST') {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(user.token_hash).run();
    return json({ ok: true }, 200, { 'Set-Cookie': cookie('', 0) });
  }
  if (path === '/api/password' && method === 'POST') {
    await rate(env, `password:${user.id}`, 5, 900);
    const data = await body(request); password(data.newPassword); text(data.currentPassword, 128, 'Mevcut şifre');
    if (!equal(await passwordHash(data.currentPassword, user.salt), user.password_hash)) fail(403, 'Mevcut şifre yanlış.');
    if (data.newPassword === data.currentPassword) fail(400, 'Yeni şifre mevcut şifreden farklı olmalı.');
    const salt = randomHex(16); const hash = await passwordHash(data.newPassword, salt);
    await env.DB.batch([
      env.DB.prepare('UPDATE staff SET password_hash=?,salt=?,must_change=0 WHERE id=?').bind(hash, salt, user.id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id)
    ]);
    return json({ ok: true }, 200, { 'Set-Cookie': cookie('', 0) });
  }
  if (user.must_change) fail(403, 'Önce geçici şifrenizi değiştirin.');
  if (path === '/api/challenge' && method === 'POST') {
    await rate(env, `challenge:${user.id}`, 10);
    const data = await body(request); const id = text(data.locationId, 40, 'Cihaz kimliği');
    if (!/^[A-Z0-9_-]{1,40}$/.test(id) || !['in', 'out'].includes(data.action)) fail(400, 'Konum veya işlem geçersiz.');
    const config = device(env, id); const nonce = randomHex(16); const challengeId = randomHex(16);
    await env.DB.prepare('INSERT INTO challenges(id,user_id,session_hash,location_id,action,nonce,expires_at) VALUES (?,?,?,?,?,?,?)')
      .bind(challengeId, user.id, user.token_hash, id, data.action, nonce, now() + 60).run();
    return json({ ok: true, challengeId, nonce, locationName: config.name, expiresIn: 60 });
  }
  if (path === '/api/checkin' && method === 'POST') {
    await rate(env, `proof:${user.id}`, 20);
    const data = await body(request);
    if (!/^[a-f0-9]{32}$/.test(data.challengeId || '') || !/^[a-f0-9]{64}$/.test(data.proof || '')) fail(400, 'Cihaz yanıtı geçersiz.');
    const challenge = await env.DB.prepare('SELECT * FROM challenges WHERE id=? AND user_id=? AND session_hash=? AND expires_at>?')
      .bind(data.challengeId, user.id, user.token_hash, now()).first();
    if (!challenge) fail(409, 'Doğrulama süresi doldu veya oturum değişti. Yeniden deneyin.');
    const config = device(env, challenge.location_id);
    if (!await verifyProof(config.key, challenge.location_id, challenge.nonce, data.proof)) fail(403, 'ESP32 yanıtı doğrulanamadı. Cihaz anahtarını kontrol edin.');
    // Atomic INSERT: replay prevention, action ordering, current session and expiry.
    const result = await env.DB.prepare(`INSERT INTO verified_checkins(id,challenge_id,user_id,location_id,action,created_at)
      SELECT ?, c.id,c.user_id,c.location_id,c.action,? FROM challenges c
      JOIN sessions s ON s.token_hash=c.session_hash JOIN staff u ON u.id=c.user_id
      WHERE c.id=? AND c.expires_at>? AND s.expires_at>? AND u.active=1 AND u.must_change=0
      AND c.action != COALESCE((SELECT action FROM verified_checkins WHERE user_id=c.user_id ORDER BY created_at DESC,rowid DESC LIMIT 1),'out')
      ON CONFLICT(challenge_id) DO NOTHING`)
      .bind(randomHex(16), now(), challenge.id, now(), now()).run();
    if (!result.meta?.changes) fail(409, 'Bu işlem zaten kaydedildi, oturum sona erdi veya giriş/çıkış sırası uygun değil. Listeyi yenileyin.');
    return json({ ok: true, name: user.display_name, locationName: config.name, action: challenge.action });
  }
  if (path === '/api/checkins' && method === 'GET') {
    const result = user.role === 'admin'
      ? await env.DB.prepare(`SELECT v.id,s.display_name AS name,v.location_id,v.action,v.created_at FROM verified_checkins v JOIN staff s ON s.id=v.user_id ORDER BY v.created_at DESC,v.rowid DESC LIMIT 200`).all()
      : await env.DB.prepare('SELECT id,location_id,action,created_at FROM verified_checkins WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 50').bind(user.id).all();
    return json({ ok: true, checkins: result.results || [] });
  }
  if (path.startsWith('/api/admin/')) {
    if (user.role !== 'admin') fail(403, 'Yönetici yetkisi gerekiyor.');
    if (path === '/api/admin/users' && method === 'GET') {
      const result = await env.DB.prepare('SELECT id,username,display_name,active,must_change,role FROM staff ORDER BY created_at DESC LIMIT 500').all();
      return json({ ok: true, users: result.results || [] });
    }
    if (path === '/api/admin/users' && method === 'POST') {
      const data = await body(request); const username = text(data.username, 64, 'Kullanıcı adı').toLowerCase();
      const name = text(data.name, 100, 'Ad soyad'); password(data.password);
      if (!/^[a-z0-9._-]{3,64}$/.test(username)) fail(400, 'Kullanıcı adı en az 3 karakter: a-z, 0-9, nokta, tire.');
      const salt = randomHex(16); const hash = await passwordHash(data.password, salt);
      const result = await env.DB.prepare(`INSERT INTO staff(id,username,display_name,password_hash,salt,role,created_at)
        VALUES (?,?,?,?,?,'staff',?) ON CONFLICT(username) DO NOTHING`).bind(randomHex(16), username, name, hash, salt, now()).run();
      if (!result.meta?.changes) fail(409, 'Bu kullanıcı adı zaten var.');
      return json({ ok: true }, 201);
    }
    if (path === '/api/admin/user' && method === 'POST') {
      const data = await body(request); const id = text(data.id, 64, 'Personel');
      const target = await env.DB.prepare("SELECT id FROM staff WHERE id=? AND role='staff'").bind(id).first();
      if (!target) fail(400, 'Personel bulunamadı.');
      const statements = [];
      if (typeof data.active === 'boolean') statements.push(env.DB.prepare('UPDATE staff SET active=? WHERE id=?').bind(data.active ? 1 : 0, id));
      else if (typeof data.password === 'string') {
        password(data.password); const salt = randomHex(16);
        statements.push(env.DB.prepare('UPDATE staff SET password_hash=?,salt=?,must_change=1 WHERE id=?').bind(await passwordHash(data.password, salt), salt, id));
      } else fail(400, 'İşlem geçersiz.');
      statements.push(env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(id));
      await env.DB.batch(statements); return json({ ok: true });
    }
  }
  fail(404, 'İşlem bulunamadı.');
}
function secure(response) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Strict-Transport-Security', 'max-age=31536000');
  headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  headers.set('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), bluetooth=(self)');
  return new Response(response.body, { status: response.status, headers });
}
export default {
  async fetch(request, env) {
    try { return secure(await route(request, env)); }
    catch (error) { return secure(json({ ok: false, error: error.status ? error.message : 'İşlem tamamlanamadı. Sunucu yapılandırmasını kontrol edin.' }, error.status || 500)); }
  },
  async scheduled(event, env) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(now()),
      env.DB.prepare('DELETE FROM rate_limits WHERE expires_at<?').bind(now()),
      env.DB.prepare('DELETE FROM challenges WHERE expires_at<? AND id NOT IN (SELECT challenge_id FROM verified_checkins)').bind(now())
    ]);
  }
};
