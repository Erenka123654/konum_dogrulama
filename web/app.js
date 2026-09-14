import { verifyNearby } from './ble.js';
const el = id => document.getElementById(id);
let user = null, busy = false;
const status = (message, kind = '') => { el('status').textContent = message; el('status').className = kind; };
function showUser(value) {
  user = value;
  el('loginSection').hidden = Boolean(user);
  el('accountSection').hidden = !user;
  el('adminSection').hidden = !user || user.role !== 'admin' || user.mustChangePassword;
  if (user) {
    el('who').textContent = user.name;
    el('checkinSection').hidden = user.mustChangePassword;
    el('passwordDetails').open = user.mustChangePassword;
    el('recordsHeading').textContent = user.role === 'admin' ? 'Son 200 personel kaydı' : 'Son 50 kaydınız';
  } else { el('records').replaceChildren(); el('users').replaceChildren(); }
}
async function api(path, data) {
  let response;
  try {
    response = await fetch(path, { method: data === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: data === undefined ? {} : { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(12000) });
  } catch { throw new Error('Sunucuya ulaşılamadı. Kayıt gönderdiyseniz tekrar denemeden önce listeyi yenileyin.'); }
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401) showUser(null);
    throw new Error(result.error || 'İşlem başarısız.');
  }
  return result;
}
async function run(task) {
  if (busy) return;
  busy = true;
  document.querySelectorAll('button').forEach(button => { button.disabled = true; });
  try { await task(); } catch (error) {
    const message = error.name === 'NotFoundError' ? 'Cihaz seçilmedi. İş yerindeki cihazı seçerek tekrar deneyin.' : error.message;
    status(message, 'error');
  } finally {
    busy = false; document.querySelectorAll('button').forEach(button => { button.disabled = false; });
    if (!navigator.bluetooth) { el('entry').disabled = true; el('exit').disabled = true; }
  }
}
function node(tag, content) { const item = document.createElement(tag); item.textContent = content; return item; }
async function records() {
  const data = await api('/api/checkins'); el('records').replaceChildren();
  for (const item of data.checkins) {
    const row = document.createElement('tr');
    row.append(...[item.name || user.name, item.action === 'in' ? 'Giriş' : 'Çıkış', item.location_id,
      new Date(item.created_at * 1000).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })].map(value => node('td', value)));
    el('records').append(row);
  }
  el('emptyRecords').hidden = data.checkins.length > 0;
}
async function users() {
  const data = await api('/api/admin/users'); el('users').replaceChildren();
  for (const item of data.users) {
    const row = document.createElement('div'); row.className = 'user';
    row.append(node('span', `${item.display_name} (${item.username}) · ${item.active ? 'Aktif' : 'Kapalı'}`));
    if (item.role === 'staff') {
      const toggle = node('button', item.active ? 'Devre dışı bırak' : 'Etkinleştir'); toggle.className = 'secondary';
      toggle.addEventListener('click', () => run(async () => { await api('/api/admin/user', { id: item.id, active: !item.active }); await users(); status('Personel durumu güncellendi.'); }));
      const reset = node('button', 'Şifre sıfırla'); reset.className = 'secondary';
      reset.addEventListener('click', () => run(async () => {
        const password = prompt('Yeni geçici şifre (en az 12 karakter):'); if (!password) return;
        await api('/api/admin/user', { id: item.id, password }); status('Geçici şifre atandı. Personele güvenli bir kanaldan iletin.');
      })); row.append(toggle, reset);
    }
    el('users').append(row);
  }
}
async function load() { if (user && !user.mustChangePassword) { await records(); if (user.role === 'admin') await users(); } }
el('loginForm').addEventListener('submit', event => { event.preventDefault(); run(async () => {
  const result = await api('/api/login', Object.fromEntries(new FormData(event.target))); event.target.reset(); showUser(result.user);
  status(user.mustChangePassword ? 'Devam etmek için geçici şifrenizi değiştirin.' : 'Giriş yapıldı.'); await load();
}); });
el('passwordForm').addEventListener('submit', event => { event.preventDefault(); run(async () => {
  await api('/api/password', Object.fromEntries(new FormData(event.target))); event.target.reset(); showUser(null); status('Şifre değiştirildi. Yeni şifrenizle giriş yapın.', 'success');
}); });
el('userForm').addEventListener('submit', event => { event.preventDefault(); run(async () => {
  await api('/api/admin/users', Object.fromEntries(new FormData(event.target))); event.target.reset(); await users(); status('Personel oluşturuldu. İlk girişte şifresini değiştirmeli.', 'success');
}); });
el('logout').addEventListener('click', () => run(async () => { await api('/api/logout', {}); showUser(null); status('Oturum kapatıldı.'); }));
el('refresh').addEventListener('click', () => run(async () => { await records(); status('Kayıtlar güncellendi.'); }));
for (const [id, action] of [['entry', 'in'], ['exit', 'out']]) el(id).addEventListener('click', () => run(async () => {
  if (!navigator.bluetooth) throw new Error('Bu tarayıcı desteklenmiyor. Android Chrome kullanın.');
  const result = await verifyNearby(navigator.bluetooth, api, action, status);
  status(`${result.action === 'in' ? 'Giriş' : 'Çıkış'} kaydedildi · ${result.locationName}`, 'success');
  try { await records(); } catch { status('Kayıt başarılı, liste yüklenemedi. Kayıtları yenileyin.', 'success'); }
}));
if (!navigator.bluetooth) el('bluetoothHelp').textContent = 'Bluetooth bu tarayıcıda desteklenmiyor. Kayıt için Android Chrome kullanın; iPhone Safari bu demoda desteklenmez.';
run(async () => { try { showUser((await api('/api/me')).user); await load(); status(user.mustChangePassword ? 'Geçici şifrenizi değiştirin.' : 'Doğrulama için hazırsınız.'); } catch (error) { if (!user) showUser(null); status(error.message); } });
