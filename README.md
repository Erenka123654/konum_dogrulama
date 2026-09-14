# ESP32 PDKS entegrasyon paketi

**Bilgi işlem için başlangıç belgesi: [Teknik teslim](docs/BILGI_ISLEM_TESLIM.md).**

ESP32 ESP-32S (30 pin) ile Bluetooth bağlantısı üzerinden tek kullanımlık cihaz doğrulaması ve Cloudflare Worker + D1 üzerinde bağımsız personel giriş/çıkış demosu. Hastanenin canlı PDKS sitesi değiştirilmemiştir; kayıtlar hastaneye aktarılmaz. Paket bir entegrasyon referansıdır, saha kabulü yapılmış üretim PDKS ürünü değildir.

## İçerik

- [BLE/API protokolü](docs/PROTOKOL.md)
- [Kabul testleri ve sınırlar](docs/KABUL_TESTLERI.md)
- [Test sonuçları](docs/TEST_SONUCLARI.md)
- [ESP32 firmware](firmware/ble_konum_beacon/ble_konum_beacon.ino)
- `web/`: aynı origin'de çalışan kullanıcı ve yönetici demosu
- `checkin-backend/`: Worker, D1 migration ve oturum/kanıt kontrolleri

## Test ortamına kurulum

Gereksinimler: Node.js 24 LTS veya üzeri, Cloudflare test hesabı, Arduino IDE/CLI ve Espressif ESP32 core 3.3.11. Gerçek personel verisi kullanmadan kurum onayıyla test edin.

1. Kaynak klasöründe `npm ci` çalıştırın. `npx wrangler login` ile test hesabına giriş yapın.
2. **Kurum için ayrı bir test D1 veritabanı oluşturun:** `npx wrangler d1 create pdks-ble-pilot`. `checkin-backend/wrangler.toml` içindeki Worker adını, database_name ve database_id değerlerini yeni test kaynaklarıyla değiştirin. Paket mevcut kullanıcının test kaynak tanımlarını içerir; bunlar hastanenin kaynakları değildir. database_name değiştirilirse package.json içindeki db komutlarını da güncelleyin.
3. `npm run provision` çalıştırın. Bu komut rastgele cihaz anahtarı, admin geçici şifresi ve bootstrap SQL üretir. Dosyalar `.local/` ve `firmware/ble_konum_beacon/device_config.h` içine yazılır; Git tarafından hariç tutulur. Aynı yapılandırmanın üstüne otomatik yazılmaz.
4. Oluşturulan `device_config.h` ve `.local/worker-secrets.json` içinde konum adı/kimliğini ihtiyaç halinde tutarlı biçimde düzenleyin. `.local/ilk-giris.txt` dosyasındaki geçici admin şifresini özel tutun. Anahtarı veya bu dosyaları e-posta/GitHub üzerinden paylaşmayın.
5. Migration uygulayın: `npm run db:remote`. Mevcut test veritabanı kullanılıyorsa eski `checkins` kayıtları silinmez; yeni kayıtlar `verified_checkins` tablosuna gider.
6. İlk admini ekleyin (aşağıdaki komutta oluşturduğunuz database_name'i kullanın):

```powershell
npx wrangler d1 execute pdks-ble-pilot --remote --config checkin-backend/wrangler.toml --file=.local/bootstrap.sql
npx wrangler secret bulk .local/worker-secrets.json --config checkin-backend/wrangler.toml
```

7. `npm run check`, `npm audit --omit=dev`, `npm run deploy:dry`, ardından `npm run deploy` çalıştırın. Bu son komut hem web arayüzünü hem API'yi aynı Worker adresine yayınlar. GitHub'a dosya yüklemek tek başına Worker deploy veya D1 migration yapmaz.
8. Arduino IDE'de `firmware/ble_konum_beacon/ble_konum_beacon.ino` dosyasını açın. **ESP32 Dev Module** kartını ve doğru seri portu seçin. USB üzerinden karta yükleyin. `device_config.h` aynı klasörde olmalıdır. Hazır binary paylaşılmamıştır; her kurum kendi anahtarıyla derler.
9. Worker adresini Android Chrome'da açın. `admin` ve geçici şifreyle giriş yapıp şifreyi değiştirin. Yönetici ekranından test personeli oluşturun. Personel ilk girişte kendi şifresini değiştirir.
10. Personel “Mesaiye başla” düğmesinden `Checkin-Konum-1` seçer. Telefonun Bluetooth ayarlarından önceden eşleştirme gerekmez. Başarılı yanıt sonrası kayıt oluşur ve bağlantı kapanır. “Mesaiyi bitir” çıkış oluşturur.

## Yerel geliştirme

`npm run db:local` migration'ı yerelde uygular. Bootstrap SQL'i `--local` ile aynı veritabanına uygulayın. `.local/worker-secrets.json` içindeki DEVICE_KEYS değerini `checkin-backend/.dev.vars` dosyasına Wrangler biçiminde ekleyin. Bu dosya Git'e girmez. `npm run dev` başlatın. Çerezler Secure olduğundan gerçek cihaz testi HTTPS test Worker'ında yapılmalıdır.

## Hastanenin web sitesine entegrasyon

Canlı adres `https://aln-portal.baskenthospitals.com/pdks/scan` ayrı uygulamadır. Bilgi işlem ekibi mevcut SSO/personel oturumunu, PDKS kayıt API'sini ve vardiya kurallarını kullanarak [teslim belgesindeki adaptör adımlarını](docs/BILGI_ISLEM_TESLIM.md) uygular. Demo giriş sistemini kurum SSO'sunun yerine koymayın.

ESP32 internet bağlantısı gerektirmez. Telefonun internete ve Bluetooth'a erişmesi gerekir. iPhone Safari bu Web Bluetooth demosunu desteklemez. Hassas metre/oda sınırı garantisi verilmez; anahtar imzası gerçek zamanlı relay saldırısını engellemez.

## Paketleme

Windows PowerShell 7 ile `pwsh -File scripts/package.ps1` paylaşılabilir ZIP üretir. Kaynaklar, kilit dosyası, belgeler ve testler dahil edilir; `.local`, özel cihaz ayarları, derleme çıktıları ve bağımlılık klasörleri hariçtir. Hastane kendi anahtarlarını üretmelidir.
