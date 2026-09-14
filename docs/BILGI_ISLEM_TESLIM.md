# Bilgi İşlem Teknik Teslim — ESP32 ile PDKS doğrulama

Tarih: 14 Eylül 2026. Hedef donanım: ESP32 ESP-32S, 30 pin. Teslim kapsamı: kaynak kod, örnek Cloudflare uygulaması, firmware ve testler. Bu paket hastanenin üretim PDKS'sine kurulmuş veya hastane tarafından kabul edilmiş bir sistem değildir.

## 1. Amaç ve kapsam

Personelin web oturumundan başlattığı giriş/çıkış işleminde, kayıtlı bir ESP32 ile anlık Bluetooth iletişimi kurulmasını doğrulamak. Mevcut hastane adresi `https://aln-portal.baskenthospitals.com/pdks/scan` için kaynak kod ve sunucu erişimi sağlanmadığından bu sayfaya entegrasyon yapılmamıştır. Cloudflare demosu bağımsız bir referans uygulamadır; gerçek PDKS kaydı üretmez.

GPS/Haversine mesafe ekranı kaldırılmıştır. ESP32 Bluetooth LE mesafe sensörü değildir. “34 metre” gibi yanıltıcı bir kesinlik gösterilmez. Başarı mesajı sadece sunucu tarafından kabul edilmiş cihaz yanıtı ve kayıt sonucuna göre gösterilir.

## 2. Teslim edilen parçalar

| Bileşen | Dosya / dizin | Görev |
|---|---|---|
| ESP32 yazılımı | firmware/ble_konum_beacon/ | Konum kimliği ve tek kullanımlık koda HMAC-SHA256 yanıtı |
| Web demo | web/ | Personel hesabı, BLE akışı, giriş/çıkış, yönetici kayıt/personel ekranı |
| Sunucu | checkin-backend/src/ | Oturumlar, istek üretimi, cihaz doğrulama, atomik kayıt |
| Veritabanı | checkin-backend/migrations/ | Yeni tablolar; eski kayıtları silmez |
| Protokol | docs/PROTOKOL.md | UUID, veri biçimleri ve API sözleşmesi |
| Kurulum | README.md | Anahtar üretimi, D1 ve Worker kurulumu |
| Kabul testleri | docs/KABUL_TESTLERI.md | Otomatik ve fiziksel doğrulama matrisi |
| Otomasyon | tests/, scripts/ | Tekrarlanabilir test, kişiye özel kurulum ve teslim arşivi |

## 3. PDKS ekibinin yapacağı entegrasyon

1. `/pdks/scan` sayfasına `web/ble.js` modülündeki BLE akışını uyarlayın. Cihaz seçimi mutlaka kullanıcının düğmeye basmasıyla başlamalıdır. Sayfa HTTPS ve üst seviye belge olarak açılmalıdır; iframe kullanılacaksa kurum politikası ve Bluetooth izinleri ayrıca değerlendirilmelidir.
2. Demo kullanıcı adı/şifre ekranını hastaneye taşımayın. Hastanenin mevcut personel/SSO oturumunu kullanın. Personel kimliğini tarayıcının gönderdiği ad/numaradan değil, doğrulanmış sunucu oturumundan alın.
3. Hastane sunucusunda challenge ve verify uçlarını oluşturun. Challenge'ı personel, oturum, cihaz ve giriş/çıkış işlemine bağlayın; 60 saniyede sona erdirin. HMAC anahtarı yalnızca cihazda ve yetkili sunucuda tutulur.
4. Başarılı doğrulamayı mevcut PDKS kayıt işlemiyle aynı veritabanı işlemi içinde kullanın. Challenge ID tekil olmalı. Tekrar denemede aynı ID ikinci mesai kaydı yaratmamalı. Harici PDKS servisi varsa idempotency anahtarı ve transactional outbox kullanın; tarayıcının “başarılı” beyanına güvenmeyin.
5. Gerçek PDKS yazımı başarısızsa personele başarı göstermeyin. Dış servis belirsiz sonuç döndürürse kayıt durumunu sunucudan sorgulayın, körlemesine tekrar yazmayın.
6. PDKS vardiya kurallarını uygulayın. Demo, personel başına ardışık giriş/çıkış zorunluluğu koyar; mola, gece vardiyası, unutulan çıkış, yönetici düzeltmesi, çoklu işyeri ve bordro kurallarının yerine geçmez. İnsan tarafından yapılan düzeltmeler ayrı denetim kaydı gerektirir.
7. Tercihen web ve API aynı kurum alan adından sunulsun. Demo aynı origin, HttpOnly/Secure/SameSite=Strict çerezler ve Origin kontrolü kullanır. Farklı alan adları gerekiyorsa kurumun kimlik mimarisine göre CORS/CSRF yeniden tasarlanmalıdır; wildcard açılmamalıdır.
8. Eski `/checkin` ve `/checkins` uçları yenide 410 döner. Eski imzasız kayıt yolunu paralel açık bırakmayın.

## 4. Sağlanan kontroller

- 128 bit rastgele nonce, 60 saniye geçerlilik, oturuma/personel ve işleme bağlı kayıt.
- Cihaz başına 256 bit gizli anahtar; HMAC-SHA256 doğrulaması sunucuda yapılır.
- Tek SQL INSERT içinde tekrar kullanım, oturum, son kullanma tarihi ve giriş/çıkış sırası kontrol edilir.
- Demo şifreleri PBKDF2-SHA256 (100.000 tur, rastgele salt) ile saklanır; üretimde kurumun SSO/MFA standardı tercih edilmelidir.
- Oturum süresi 8 saat; şifre değişikliği, personel devre dışı bırakma ve şifre sıfırlamada oturumlar iptal edilir.
- Personel yalnızca kendi son 50 kaydını; yönetici son 200 kaydı görür. Yönetici demo ekranı en fazla 500 personel listeler. Bu sınırlar raporlama/arşiv çözümü değildir.
- IP ve kullanıcı bazlı deneme sınırları; 4 KB istek gövdesi sınırı; CSP ve no-store.
- Hata ve zaman aşımında Bluetooth bağlantısını kapatma; ESP32'de 75 saniyelik bağlantı sınırı.

## 5. Sınırlar ve kurum kararları

Bu protokol hassas mesafe veya kişinin kimliğine dair fiziksel kanıt sağlamaz. Telefon başka bir personele verilebilir. Canlı Bluetooth trafiği bir başka noktaya aktarılabilir (relay); 60 saniyelik süre mesafe sınırlaması değildir. Fiziksel erişimi olan saldırgan, standart ESP32 flash belleğindeki anahtarı çıkarabilir. Üretimde cihaz sabitleme, anahtar rotasyonu, Secure Boot/Flash Encryption ve kurumun donanım güvenliği süreci değerlendirilmelidir. eFuse ayarları geri döndürülemez olabileceğinden bu paket bunları otomatik değiştirmez.

Yayın gücü başlangıçta düşük ayarlanmıştır; anten, duvar, telefon modeli ve yoğunluk sonucu değiştirir. İç/dış ayrımında kesin hata yüzdesi taahhüt edilmez. Saha kabul testleri ile yanlış kabul ve yanlış ret sayıları ölçülmelidir. Mesai için kesin fiziksel temas gerekiyorsa kurum kontrollü yakın temas okuyucusu gibi farklı bir doğrulama yöntemi seçmelidir.

Web Bluetooth akışı için hedef Android Chrome'dur. iPhone Safari desteklenmez; kurum iPhone personeli için yerel uygulama veya mevcut onaylı alternatif süreç belirlemelidir. İşlemin gerçekleşmediği durumlarda otomatik “devamsız” sonucu üretmeyin; ayrı hata/istisna süreci kullanın.

Personel verilerinin kurum dışındaki Cloudflare hesabında tutulması, veri yerleşimi, saklama/silme süreleri, erişim rolleri ve yedekleme politikası kurum tarafından onaylanmalıdır. Pilot verisiyle başlayın; demo hesabına gerçek personel verisi yüklenmesi otomatik olarak yetkilendirilmiş sayılmaz. Bu doküman mevzuat uygunluğu sertifikası değildir.

## 6. Devir ve canlıya geçiş

- Bilgi işlem kendi anahtarlarını `npm run provision` ile üretir. Paylaşılan ZIP özel anahtar, şifre veya firmware binary içermez.
- Eski test projesinin üretim ayarları kullanılmadan kurumun test D1 ve Worker kaynakları tanımlanır.
- Firmware derlenip fiziksel ESP32'ye yüklenir; BLE ve kullanıcı akışı saha testinden geçirilir.
- Hastane sunucu adaptörü, denetim kayıtları ve vardiya kuralları tamamlanır.
- Kurum onayı sonrası kontrollü pilot, ardından üretim. Sorunda eski onaylı PDKS yöntemine dönülür; imzasız demo API geri açılmaz.

## 7. Referanslar

- Espressif Arduino ESP32 BLE: https://github.com/espressif/arduino-esp32/tree/master/libraries/BLE
- Web Bluetooth GATT: https://developer.chrome.com/docs/capabilities/bluetooth
- Cloudflare Workers statik içerik: https://developers.cloudflare.com/workers/static-assets/
- Bluetooth mesafe ölçümü sınırları: https://www.bluetooth.com/bluetooth-le-primer/
