# ESP32 Check-in Backend (Cloudflare Worker + D1)

## Ne yapıyor?
- `POST /checkin` — ESP32'den gelen check-in verisini D1 veritabanına kaydeder.
- `GET /checkins` — Kayıtlı check-in'leri listeler (yönetici görünümü için kullanabilirsiniz).
- `GET /checkins?location_id=SUBE_ALANYA_1` — Belirli bir konuma göre filtreler.

## Kurulum (bilgisayarınızda, terminal üzerinden)

### 1. Node.js ve Wrangler
Node.js kurulu değilse önce [nodejs.org](https://nodejs.org) üzerinden kurun. Sonra:
```bash
npm install -g wrangler
wrangler login
```
Bu komut tarayıcıda Cloudflare hesabınızla giriş yapmanızı isteyecek.

### 2. D1 veritabanını oluşturun
Bu klasörün içindeyken:
```bash
wrangler d1 create esp32-checkin-db
```
Bu komut size şuna benzer bir çıktı verecek:
```
[[d1_databases]]
binding = "DB"
database_name = "esp32-checkin-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```
Buradaki `database_id` değerini kopyalayıp `wrangler.toml` dosyasındaki
`BURAYA_D1_DATABASE_ID_GELECEK` yazısının yerine yapıştırın.

### 3. Tabloyu oluşturun
```bash
wrangler d1 execute esp32-checkin-db --remote --file=./schema.sql
```

### 4. Worker'ı deploy edin
```bash
wrangler deploy
```
Deploy tamamlanınca terminalde şuna benzer bir adres göreceksiniz:
```
https://esp32-checkin-backend.<sizin-subdomain>.workers.dev
```
Bu adresi kopyalayın.

### 5. ESP32 firmware'inde kullanın
`esp32_wifi_checkin.ino` dosyasındaki şu satırı güncelleyin:
```cpp
#define BACKEND_URL       "https://esp32-checkin-backend.<sizin-subdomain>.workers.dev/checkin"
```

## Test etme
Deploy ettikten sonra terminalden test edebilirsiniz:
```bash
curl -X POST https://esp32-checkin-backend.<sizin-subdomain>.workers.dev/checkin \
  -H "Content-Type: application/json" \
  -d '{"employeeName":"Test Kullanici","locationId":"SUBE_ALANYA_1","source":"manual_test"}'
```
Başarılıysa `{"ok":true}` dönmeli. Sonra kayıtları görmek için:
```bash
curl https://esp32-checkin-backend.<sizin-subdomain>.workers.dev/checkins
```

## Notlar
- Bu Worker herkese açık (kimlik doğrulama yok). Üretime almadan önce en azından
  basit bir API key kontrolü eklemenizi öneririm — isterseniz bunu da ekleyebilirim.
- `GET /checkins` şu an herkese açık; yönetici paneli olarak kullanacaksanız
  bir şifre/token ile korumanız gerekir.
