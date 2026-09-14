# Teslim öncesi test sonuçları

14 Eylül 2026 tarihinde yerel ortamda doğrulandı:

| Kontrol | Sonuç |
|---|---|
| `npm run check` | JavaScript sözdizimi ve 9 otomatik test geçti |
| `node scripts/runtime-smoke.mjs` | Gerçek Cloudflare workerd + yerel D1: giriş, PBKDF2, challenge, HMAC ve atomik kayıt geçti |
| `npm run deploy:dry` | Wrangler 4.131.1 ile Worker ve 4 web dosyası paketlendi |
| D1 migration | Yerel D1 üzerinde 0001_secure_checkin.sql uygulandı |
| `npm audit` | Geliştirme ve üretim bağımlılıkları dahil 0 açık bildirildi |
| `npm audit --omit=dev` | 0 açık bildirildi |
| ESP32 derleme | Espressif core 3.3.11, `esp32:esp32:esp32`: başarılı |
| Firmware boyutu | 1.101.207 byte flash (%84); 41.380 byte global RAM (%12) |

ESP32 derleme komutu:

```text
arduino-cli compile --fqbn esp32:esp32:esp32 --output-dir firmware/build firmware/ble_konum_beacon
```

Derleme için yalnızca yerel olarak oluşturulan özel anahtar kullanıldı. Firmware binary dosyaları anahtar içerebileceğinden paylaşım paketine dahil değildir. Kurum kendi anahtarını üretip yeniden derlemelidir.

## Yapılmayan kontroller

Fiziksel ESP32'ye USB yükleme, gerçek telefonda Web Bluetooth bağlantısı, telefon tarayıcısında uçtan uca görsel/etkileşim testi, hastane SSO/PDKS entegrasyonu, Cloudflare uzak deploy, gerçek ağ yükü ve bina içi/dışı menzil testi yapılmadı. Otomatik testler, fiziksel mesafe doğruluğu veya kurum üretim kabulü anlamına gelmez. Saha kabul matrisi KABUL_TESTLERI.md içindedir.

Çalışma kopyasındaki özel anahtarlar ve geçici admin şifresi paylaşılabilir ZIP'e eklenmez. ZIP yalnızca izin verilen kaynak/belge/test dosyalarından oluşturulur.
