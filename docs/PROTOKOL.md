# BLE ve API protokolü v2

## BLE GATT

Servis: `6e400001-b5a3-f393-e0a9-e50e24dcca9e`.

| Karakteristik | Son blok | İzin | Değer |
|---|---|---|---|
| Konum | 0002 | READ | UTF-8 `SUBE_1`; `[A-Z0-9_-]{1,40}` |
| İstek | 0003 | WRITE (response ile) | 16 ham byte nonce, hex metin değil |
| Yanıt | 0004 | READ | 32 ham byte HMAC, hex metin değil |

UUID'lerin tamamında servis UUID'sindeki `0001` sırasıyla `0002`, `0003`, `0004` olur; kalan bölümler aynıdır. Konum adı sunucuda kimlikten eşlenir, cihazın serbest metnine güvenilmez.

İmzalanan mesajın tam biçimi:

```text
checkin-v2|SUBE_1|00112233445566778899aabbccddeeff
```

UTF-8, sonda satır sonu veya NUL yok. Nonce her zaman 32 küçük hex karakterdir. `HMAC-SHA256(rawDeviceKey32Bytes, message)` çıktısı 32 byte. BLE yazısı 16 byte olduğundan varsayılan ATT MTU ile uyumludur. Yanıt okuması GATT long-read destekli olmalıdır; tarayıcı `readValue()` sonucunun 32 byte olduğunu kontrol eder.

## Demo API

Web ve API aynı Worker origin'inde. Yazma istekleri `Content-Type: application/json`, aynı origin `Origin` başlığı ve girişten sonra `__Host-checkin` HttpOnly oturum çerezi kullanır. İstek gövdesi en fazla 4096 byte. Örneklerin tüm değerleri temsili; gerçek oturum/anahtar içermez.

| Yol | Yöntem | Yetki / Gövde |
|---|---|---|
| /api/login | POST | username, password |
| /api/me | GET | Oturum; personel bilgisi |
| /api/logout | POST | Oturum; `{}` |
| /api/password | POST | currentPassword, newPassword; tüm oturumları kapatır |
| /api/challenge | POST | Oturum; locationId, action (`in` / `out`) |
| /api/checkin | POST | Oturum; challengeId, proof (64 küçük hex karakter) |
| /api/checkins | GET | Personelin kendi kayıtları; yönetici tüm son kayıtlar |
| /api/admin/users | GET / POST | Yönetici; POST username, name, password; staff oluşturur |
| /api/admin/user | POST | Yönetici; id ve active veya password; yalnızca staff |

Challenge yanıtı: `{ok:true,challengeId,nonce,locationName,expiresIn:60}`. Nonce, oturum/personel/işlem/cihaz ile sunucuda saklanır. Personel kimliği ve işlem verify isteğinde yeniden alınmaz.

Doğrulama yanıtı: `{ok:true,name,locationName,action}`. Sunucu zamanı UTC epoch saniye olarak kaydedilir, demo Türkiye saatinde gösterir. Başlangıç eylemi `in` olmalı; aynı eylem ardışık kabul edilmez.

Hata yanıtı: `{ok:false,error:"kullanıcıya uygun açıklama"}`. 400 biçim/cihaz, 401 oturum, 403 yetki/imza/origin, 409 süresi dolmuş/tekrar/sıra, 413 boyut, 429 deneme sınırı, 500/503 sunucu. Aynı challenge için eşzamanlı istekler en fazla bir kayıt üretir. İstemcide ağ zaman aşımı oluşması, sunucuda kayıt olmadığı anlamına gelmez; liste kontrol edilir.

## Hastane adaptörü

`web/ble.js` içindeki `verifyNearby(bluetooth, api, action, update)` fonksiyonuna hastanenin API çağrısını yapan fonksiyon verilebilir. API fonksiyonu kimliği sunucu oturumundan alan kurum uçlarına istek göndermeli ve yukarıdaki yanıt biçimini sağlamalıdır. Cihaz anahtarı JS içine eklenmez. Demo hesap sistemini PDKS'ye kopyalamak yerine kurumun oturum çözümünü kullanın.

Anahtarlar Worker'da `DEVICE_KEYS` secret olarak JSON biçiminde saklanır: konum kimliği -> `{name,key}`. Her cihaza ayrı anahtar verin. Mevcut key değiştiğinde o cihaz firmware'i de güncellenmelidir. Bu sürüm otomatik anahtar rotasyonu veya çift anahtarlı geçiş uygulamaz.
