export const UUID = {
  service: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  location: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
  challenge: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
  proof: '6e400004-b5a3-f393-e0a9-e50e24dcca9e'
};
export async function verifyNearby(bluetooth, api, action, update) {
  let device; let expired = false; let timer;
  // requestDevice stays within the user click; network requests happen afterwards.
  device = await bluetooth.requestDevice({ filters: [{ services: [UUID.service] }] });
  const disconnect = () => { if (device?.gatt?.connected) device.gatt.disconnect(); };
  const operation = async () => {
    try {
      update('Cihaza bağlanılıyor…');
      const server = await device.gatt.connect();
      if (expired) { disconnect(); throw new Error('Bağlantı süresi doldu.'); }
      const service = await server.getPrimaryService(UUID.service);
      const location = await service.getCharacteristic(UUID.location);
      const locationId = new TextDecoder('utf-8', { fatal: true }).decode(await location.readValue()).trim();
      if (!/^[A-Z0-9_-]{1,40}$/.test(locationId)) throw new Error('Cihaz kimliği geçersiz.');
      const challengeChar = await service.getCharacteristic(UUID.challenge);
      const proofChar = await service.getCharacteristic(UUID.proof);
      if (expired) throw new Error('Doğrulama süresi doldu.');
      update('Cihaz doğrulanıyor…');
      const challenge = await api('/api/challenge', { locationId, action });
      if (expired) throw new Error('Doğrulama süresi doldu.');
      if (!/^[a-f0-9]{32}$/.test(challenge.nonce)) throw new Error('Sunucu kodu geçersiz.');
      await challengeChar.writeValueWithResponse(Uint8Array.from(challenge.nonce.match(/../g), b => parseInt(b, 16)));
      const value = await proofChar.readValue();
      if (value.byteLength !== 32) throw new Error('Cihaz yanıtı geçersiz. Yeni ESP32 yazılımını kontrol edin.');
      const proof = Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), b => b.toString(16).padStart(2, '0')).join('');
      if (expired) throw new Error('Doğrulama süresi doldu.');
      // Release the peripheral before the internet request so the next person can connect.
      disconnect();
      update('Kayıt sunucuya gönderiliyor…');
      return await api('/api/checkin', { challengeId: challenge.challengeId, proof });
    } finally { disconnect(); }
  };
  try {
    return await Promise.race([operation(), new Promise((_, reject) => {
      timer = setTimeout(() => { expired = true; disconnect(); reject(new Error('İşlem süresi doldu. Kayıtları yenileyip kontrol edin.')); }, 55000);
    })]);
  } finally { clearTimeout(timer); disconnect(); }
}
