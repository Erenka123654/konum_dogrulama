/*
  ESP32 BLE Konum Doğrulama Beacon
  --------------------------------
  Bu ESP32, belirli bir fiziksel konumu temsil eden bir BLE GATT
  cihazı olarak çalışır. Web sayfası (Web Bluetooth API) bu cihaza
  bağlanıp LOCATION_ID karakteristiğini okuyarak "bu telefon şu anda
  bu konuma yakın" doğrulamasını yapar.

  Her fiziksel konum (şube, ofis, vb.) için:
    1. LOCATION_ID değerini değiştirin (örn. "SUBE_ANKARA_1")
    2. DEVICE_NAME değerini değiştirin (örn. "Checkin-Ankara-1")
  ve ayrı bir ESP32'ye yükleyin.

  Kütüphane: ESP32 Arduino core içinde gelen "BLEDevice" (ekstra kurulum gerekmez)
*/

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ==================== AYARLAR (konuma göre değiştirin) ====================
#define DEVICE_NAME   "Checkin-Konum-1"
#define LOCATION_ID   "SUBE_1"          // Backend'de bu ID'yi konumla eşleştireceksiniz
// ============================================================================

// Sabit servis ve karakteristik UUID'leri - TÜM beacon'larda AYNI kalmalı
// (web sayfası bu UUID'yi arayarak cihazı bulur)
#define SERVICE_UUID        "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define LOCATION_CHAR_UUID  "6e400002-b5a3-f393-e0a9-e50e24dcca9e"

BLECharacteristic *pLocationCharacteristic;
bool deviceConnected = false;

class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *pServer) override {
    deviceConnected = true;
    Serial.println("Bir cihaz bağlandı.");
  }
  void onDisconnect(BLEServer *pServer) override {
    deviceConnected = false;
    Serial.println("Cihaz bağlantısı kesildi, yeniden yayına başlıyor...");
    // Bağlantı kesilince tekrar advertise etmeye başla (varsayılan olarak durur)
    pServer->getAdvertising()->start();
  }
};

void setup() {
  Serial.begin(115200);
  Serial.println("ESP32 BLE Konum Beacon başlatılıyor...");

  BLEDevice::init(DEVICE_NAME);

  BLEServer *pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);

  pLocationCharacteristic = pService->createCharacteristic(
      LOCATION_CHAR_UUID,
      BLECharacteristic::PROPERTY_READ
  );
  pLocationCharacteristic->setValue(LOCATION_ID);

  pService->start();

  // Reklam (advertising) ayarları
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  pAdvertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();

  Serial.println("Yayın başladı. Konum ID: " + String(LOCATION_ID));
}

void loop() {
  // BLE olay tabanlı çalışır, loop içinde bir şey yapmaya gerek yok.
  // İsterseniz burada LED yakıp söndürerek "yayında" durumunu gösterebilirsiniz.
  delay(1000);
}
