# Kabul ve doğrulama planı

## Otomatik kontroller

`npm ci`, `npm run check`, `npm audit --omit=dev`, `npm run deploy:dry` çalıştırılır. Testler gerçek SQLite sorgularını, Worker işleyicisini ve bağımsız Node HMAC uygulamasını kullanır. BLE tarayıcı testleri taklit GATT nesneleri kullanır; gerçek radyo testinin yerine geçmez.

Kapsam: geçerli giriş/çıkış, tekrar kullanım, hatalı imza, süre sonu, başka personelin oturumu, yetkisiz liste erişimi, eski API kapanışı, Origin kontrolü, zorunlu şifre değişimi, oturum iptali, deneme sınırı, büyük gövde ve BLE hatasında bağlantı kapatma.

## Bilgi işlem tarafından fiziksel olarak çalıştırılacak testler

| Test | Beklenen sonuç | Durum |
|---|---|---|
| Yeni firmware, doğru Worker anahtarı, Android Chrome | İlk giriş/şifre değişimi sonrası giriş ve çıkış kaydı | Saha testi bekliyor |
| Yanlış cihaz anahtarı | 403, kayıt oluşmaz | Saha testi bekliyor |
| Eski firmware | Challenge/yanıt karakteristiği bulunamaz, kayıt yok | Saha testi bekliyor |
| Bluetooth kapalı, izin reddi veya cihaz seçimini iptal | Açık hata, kayıt yok, düğme tekrar kullanılabilir | Saha testi bekliyor |
| ESP32 fişini işlem sırasında çekme | Hata/zaman aşımı; başarı gösterilmez | Saha testi bekliyor |
| İki telefon peş peşe, bir telefon bağlantıyı açık bırakıyor | İlk bağlantı kapanır veya 75 sn sınırı işler, diğeri tekrar deneyebilir | Saha testi bekliyor |
| İnternet kesilmesi / yanıt kaybı | Liste kontrolü; aynı challenge ikinci kaydı oluşturmaz | Saha testi bekliyor |
| Personel kapatılırken açık oturum | Sonraki API işlemi reddedilir | Saha testi bekliyor |
| iPhone Safari | Desteklenmediği açıkça belirtilir, sahte başarı yok | Saha testi bekliyor |
| Hastane PDKS servisi yanıt vermiyor | PDKS kaydı tamamlanmadan başarı yok | Hastane adaptörü bekliyor |

## Menzil ve hata oranı pilotu

En az üç farklı telefonla, farklı tutuş/cep durumlarında cihaz yanı, giriş noktası, yan oda, kapı dışı ve bina dışı noktalarında tekrarlar yapın. Her noktada aynı sayıda deneme uygulayın (örnek: 20). Her denemede telefon modeli, gerçek nokta, saat, sonuç, bağlantı süresi ve varsa hata kaydedilsin. Gerçek personel adı gerekmeyen test hesapları kullanın.

- Yanlış kabul oranı = yasak bölgede kabul / yasak bölgedeki toplam deneme.
- Yanlış ret oranı = izinli bölgede ret / izinli bölgedeki toplam deneme.
- Bluetooth menzili için sıfır yanlış kabul garantisi yoktur; eşikler kurumun risk sahibi tarafından belirlenir.
- Cihazın kutusu/konumu/yayın gücü değiştiğinde testi tekrarlayın.
- Menzil dışı kullanım engellenemiyorsa hassas konum doğrulaması olarak üretime almayın; farklı fiziksel kontrol seçin.

## Üretim öncesi kontrol

Kurum SSO bağlantısı, PDKS idempotency/transaction, vardiya kuralları, yönetici düzeltme denetimi, yedek ve geri dönüş, veri saklama/silme süresi, erişim yetkileri ve alternatif personel işlem yöntemi tamamlanmalı. Paket bunların tamamlandığına dair bir onay içermez.
