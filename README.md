# ESP32 Bluetooth Konum Doğrulama - Check-in Sistemi

## Nasıl çalışır?
1. Her konuma bir ESP32 yerleştirilir. ESP32, BLE üzerinden o konuma özel bir
   `LOCATION_ID` yayınlar (GATT karakteristiği olarak).
2. Çalışan, konuma geldiğinde web sayfasındaki "Bluetooth ile Konumu Doğrula"
   butonuna basar.
3. Tarayıcı (Web Bluetooth API) yakındaki ESP32'yi bulur, bağlanır, LOCATION_ID'yi
   okur ve backend'e check-in isteği gönderir.

## ÖNEMLİ KISITLAMA
**Web Bluetooth API iPhone Safari'de desteklenmiyor.** Bu akış sadece
Android + Chrome/Edge gibi tarayıcılarda çalışır. iPhone kullanıcıları için
bu yöntem uygun değildir — onlar için QR kod tabanlı check-in akışınızı
kullanmaya devam etmeniz gerekir.

## Kurulum

### 1. ESP32 Firmware
- `firmware/ble_konum_beacon.ino` dosyasını Arduino IDE'de açın.
- Board olarak kullandığınız ESP32 kartını seçin (Tools > Board).
- Her fiziksel konum için dosyanın başındaki iki satırı değiştirin:
  ```cpp
  #define DEVICE_NAME   "Checkin-Konum-1"
  #define LOCATION_ID   "SUBE_1"
  ```
- Yükleyin. Seri port monitöründe (115200 baud) "Yayın başladı" mesajını görmelisiniz.
- 2-5 konum için bu adımı her ESP32 için ayrı ayrı tekrarlayın, her birine
  farklı bir `LOCATION_ID` verin.

### 2. Web Sayfası
- `web/index.html` içinde `CHECKIN_ENDPOINT` değerini kendi backend adresinizle
  değiştirin (Cloudflare Worker vb.).
- Bu sayfa **HTTPS üzerinden** sunulmalıdır — Web Bluetooth API, güvenlik
  gereği yalnızca HTTPS (veya localhost) üzerinde çalışır.

### 3. Backend (kendi tarafınızda kurmanız gerekiyor)
- `POST /checkin` endpoint'i şu JSON'u kabul etmeli:
  ```json
  {
    "employeeName": "Ad Soyad",
    "locationId": "SUBE_1",
    "timestamp": "2026-09-10T10:00:00.000Z"
  }
  ```
- Bu isteği alıp veritabanınıza (örn. Cloudflare D1) kaydetmeniz yeterli.

## Test etme
1. ESP32'yi yükleyip çalıştırın.
2. `web/index.html` dosyasını bir HTTPS sunucusunda (veya `localhost`'ta) açın.
3. Android telefonda Chrome ile sayfayı açın, adınızı girin, butona basın.
4. Açılan cihaz listesinde "Checkin-Konum-1" (veya verdiğiniz isim) görünmeli —
   seçin, bağlanın.
5. Konum ID'sinin okunduğunu ve check-in isteğinin gönderildiğini doğrulayın.

## Menzil / güvenilirlik notu
BLE menzili ESP32'nin anten gücüne ve ortamdaki engellere (duvar, metal
dolap vb.) göre değişir; tipik olarak 10-30 metre arasıdır. Kod, hassas
mesafe/RSSI hesabı yapmak yerine sadece "bağlanabildi mi" kontrolü yapar —
bu, gürültülü RSSI ölçümüne göre çok daha güvenilirdir. Menzili daraltmak
isterseniz ESP32'nin TX güç seviyesini düşürebilirsiniz
(`esp_ble_tx_power_set` fonksiyonu ile).
