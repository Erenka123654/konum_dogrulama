/* BLE presence proof, protocol v2. This does not measure distance.
   ESP32 Arduino core 3.3.11. Run npm run provision to create device_config.h.
   Private keys must never be committed or sent to a browser. */
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <mbedtls/md.h>
#include "device_config.h"

#define SERVICE_UUID "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define LOCATION_UUID "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
#define CHALLENGE_UUID "6e400003-b5a3-f393-e0a9-e50e24dcca9e"
#define PROOF_UUID "6e400004-b5a3-f393-e0a9-e50e24dcca9e"

BLEServer *server;
BLECharacteristic *proof;
uint8_t deviceKey[32];
volatile bool connected = false;
volatile bool restartAdvertising = false;
volatile uint32_t connectedAt = 0;
volatile uint16_t connectionId = 0;

class ChallengeCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    // Raw 16-byte nonce fits the default 20-byte ATT write payload.
    proof->setValue("");
    if (characteristic->getLength() != 16) return;
    const uint8_t *nonce = characteristic->getData();
    char nonceHex[33];
    for (int i = 0; i < 16; i++) snprintf(nonceHex + i * 2, 3, "%02x", nonce[i]);
    String message = String("checkin-v2|") + LOCATION_ID + "|" + nonceHex;
    uint8_t mac[32];
    const auto *info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
    if (info && mbedtls_md_hmac(info, deviceKey, sizeof(deviceKey),
        reinterpret_cast<const uint8_t *>(message.c_str()), message.length(), mac) == 0) {
      proof->setValue(mac, sizeof(mac));
    }
    memset(mac, 0, sizeof(mac));
  }
};
class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *s, esp_ble_gatts_cb_param_t *param) override {
    connectionId = param->connect.conn_id;
    connectedAt = millis();
    connected = true;
    proof->setValue("");
  }
  void onDisconnect(BLEServer *s) override {
    connected = false;
    proof->setValue("");
    restartAdvertising = true;
  }
};
void setup() {
  Serial.begin(115200);
  const char *key = DEVICE_KEY_HEX;
  if (strlen(key) != 64) { Serial.println("Cihaz anahtari gecersiz; yayin kapali."); return; }
  for (int i = 0; i < 32; i++) {
    char pair[3] = {key[i * 2], key[i * 2 + 1], 0};
    if (!isxdigit(pair[0]) || !isxdigit(pair[1])) { Serial.println("Gecersiz anahtar."); return; }
    deviceKey[i] = strtoul(pair, nullptr, 16);
  }
  BLEDevice::init(DEVICE_NAME);
  // Lower power reduces coverage, but cannot impose a reliable distance boundary.
  BLEDevice::setPower(ESP_PWR_LVL_N12, ESP_BLE_PWR_TYPE_ADV);
  BLEDevice::setPower(ESP_PWR_LVL_N12, ESP_BLE_PWR_TYPE_DEFAULT);
  server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());
  auto *service = server->createService(SERVICE_UUID);
  auto *location = service->createCharacteristic(LOCATION_UUID, BLECharacteristic::PROPERTY_READ);
  location->setValue(LOCATION_ID);
  proof = service->createCharacteristic(PROOF_UUID, BLECharacteristic::PROPERTY_READ);
  proof->setValue("");
  auto *challenge = service->createCharacteristic(CHALLENGE_UUID, BLECharacteristic::PROPERTY_WRITE);
  challenge->setCallbacks(new ChallengeCallbacks());
  service->start();
  auto *advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);
  BLEDevice::startAdvertising();
  Serial.println("BLE dogrulama v2 hazir. Anahtar seri porta yazdirilmaz.");
}
void loop() {
  if (connected && millis() - connectedAt > 75000) {
    server->disconnect(connectionId);
    connectedAt = millis();
  }
  if (restartAdvertising) {
    restartAdvertising = false;
    delay(200);
    BLEDevice::startAdvertising();
  }
  delay(20);
}
