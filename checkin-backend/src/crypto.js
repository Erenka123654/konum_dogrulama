const encoder = new TextEncoder();
export const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
export function unhex(value) {
  if (typeof value !== 'string' || !/^(?:[a-f0-9]{2})+$/.test(value)) throw new Error('Invalid hex');
  return Uint8Array.from(value.match(/../g), b => parseInt(b, 16));
}
export const randomHex = bytes => hex(crypto.getRandomValues(new Uint8Array(bytes)));
export const sha256 = async value => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
export async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(salt), iterations: 100000 }, key, 256));
}
export function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
export const proofMessage = (location, nonce) => encoder.encode(`checkin-v2|${location}|${nonce}`);
export async function verifyProof(secret, location, nonce, proof) {
  if (!/^[a-f0-9]{64}$/.test(proof || '') || !/^[a-f0-9]{64}$/.test(secret || '')) return false;
  const key = await crypto.subtle.importKey('raw', unhex(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, unhex(proof), proofMessage(location, nonce));
}
