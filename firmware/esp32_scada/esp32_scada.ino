/*
 * OFK SCADA — ESP32 Firmware v1.3
 * ============================================================
 * Reset davranışı (çift reset yöntemi):
 *
 *   - Tek reset (RST'ye 1 kez bas) → kaldığı yerden devam
 *   - Çift reset (3 sn içinde 2 kez bas) → NVS temizle, AP modu
 *   - Güç kesintisi → kaldığı yerden devam
 *
 * Nasıl çalışır:
 *   Boot'ta NVS'de "boot_flag" kontrol edilir.
 *   Eğer flag = 1 ise → 3 sn içinde ikinci reset geldi → AP modu
 *   Eğer flag = 0 ise → flag = 1 yaz, 3 sn bekle, sonra flag = 0 yaz → devam
 * ============================================================
 */

#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <ModbusRTU.h>    // emeliart/modbus-esp8266

#define RS485_RX   16
#define RS485_TX   17
#define RS485_DE   4

// ─────────────────────────────────────────────
// Sabitler
// ─────────────────────────────────────────────
#define HEARTBEAT_INTERVAL_MS     5000
#define WIFI_CONNECT_TIMEOUT_S    30
#define REGISTER_RETRY_LIMIT      3
#define REGISTER_RETRY_DELAY_MS   5000
#define WIFI_RECONNECT_INTERVAL_S 10
#define WIFI_MAX_FAIL             5
#define DOUBLE_RESET_WINDOW_MS    3000  // çift reset penceresi
#define FIRMWARE_VERSION          "1.4.0"
#define DEVICE_MODEL              "ESP32-WROOM-32"
#define NVS_NAMESPACE             "esp32cfg"

// ─────────────────────────────────────────────
// Modbus Veri Yapıları
// ─────────────────────────────────────────────
enum DataType { DT_W = 0, DT_INT = 1, DT_DW = 2, DT_DINT = 3, DT_FLT = 4 };

struct RegisterEntry {
    uint16_t address;
    DataType dataType;
    char     plcTag[12];
};

struct RegisterTable {
    RegisterEntry entries[64];
    uint8_t  count;
    uint16_t totalWords;
    uint16_t startAddr;
};

// Coil tablosu
struct CoilEntry {
    uint16_t address;
    char     plcTag[12];
};

struct CoilTable {
    CoilEntry entries[128];
    uint8_t   count;
    uint16_t  startAddr;
};

// ─────────────────────────────────────────────
// Forward declarations
// ─────────────────────────────────────────────
void startAPMode();
bool connectWifi();
bool registerDevice();
void sendHeartbeat();
void handleWifiReconnect();
void handleRoot();
void handleProvisioningForm();
void saveToNVS();
void loadFromNVS();
void saveEsp32IdToNVS(int32_t id);
void clearAllNVS();
String buildWifiOptions();
String buildProvisioningPage(const String& statusMsg = "");
bool checkDoubleReset();
void setupModbus();
void readModbusAndSend();
bool modbusReadCoils();
bool modbusReadRegisters();
bool modbusWaitResponse(uint32_t timeoutMs);
void parseDataRegisters(JsonArray arr);
void parseCoils(JsonArray arr);
void sendDataToServer();
DataType parseDataType(const char* dt);
uint8_t getWordSizeFromType(DataType dt);

// ─────────────────────────────────────────────
// Global değişkenler
// ─────────────────────────────────────────────
Preferences prefs;
WebServer   apServer(80);
ModbusRTU       mb;
RegisterTable   g_regTable  = {};
CoilTable       g_coilTable = {};
uint16_t        g_regBuffer[128];    // Register okuma buffer (max 128 word)
bool            g_coilBuffer[128];   // Coil okuma buffer (max 128 bit)
bool            g_modbusReady    = false;
unsigned long   g_lastModbusRead = 0;
uint32_t        g_readInterval   = 1000;  // ms
uint32_t        g_modbusTimeout  = 500;   // ms
uint8_t         g_retryCount     = 2;
uint8_t         g_slaveId        = 1;
uint32_t        g_baudRate       = 9600;

String  g_wifiSsid   = "";
String  g_wifiPass   = "";
String  g_serverUrl  = "";
String  g_esp32Tag   = "";
String  g_deviceType = "";
int32_t g_esp32Id    = 0;

bool    g_apMode         = false;
bool    g_provisioning   = false;
String  g_deviceId       = "";    // Bağlı SCADA cihazı ID'si (NVS'den)
String  g_deviceStatus        = "";    // Bağlı SCADA cihazının durumu (online/offline)
bool    g_sendConfigAck       = false; // Bir sonraki heartbeat'e config_ack ekle
bool    g_sendStatusAck       = false; // device_status alındı, bir sonraki HB'de teyit gönder
String  g_pendingStatusAck    = "";    // Gönderilecek status teyidi ("online"/"offline")

unsigned long g_lastHeartbeat = 0;
unsigned long g_lastWifiRetry = 0;
int           g_wifiFailCount = 0;

// ─────────────────────────────────────────────
// Çift Reset Tespiti
// ─────────────────────────────────────────────

/*
 * Boot'ta NVS'de "boot_flag" kontrol et:
 *   flag = 1 → bu ikinci reset (3 sn pencere içinde) → AP moduna geç
 *   flag = 0 → flag = 1 yap, 3 sn bekle, 0 yap → normal devam
 *
 * Kullanım:
 *   RST'ye 1 kez bas → normal boot → 3 sn dolunca flag sıfırlanır
 *   RST'ye 2 kez bas (3 sn içinde) → flag hâlâ 1 → AP modu tetiklenir
 */
bool checkDoubleReset() {
    prefs.begin("dbl_rst", false);
    int flag = prefs.getInt("flag", 0);

    if (flag == 1) {
        // İkinci reset — temizle ve AP moduna hazırlan
        prefs.putInt("flag", 0);
        prefs.end();
        Serial.println("[DoubleReset] Cift reset algilandi -> AP modu!");
        return true;
    }

    // İlk reset — bayrağı 1 yap, 3 sn bekle, sonra 0 yap
    prefs.putInt("flag", 1);
    prefs.end();

    Serial.printf("[DoubleReset] Tek reset. %d ms icinde tekrar basarsan AP modu...\n",
                  DOUBLE_RESET_WINDOW_MS);

    // 3 sn pencere — bu sürede ikinci reset gelirse yukarıdaki kola girer
    unsigned long start = millis();
    while (millis() - start < DOUBLE_RESET_WINDOW_MS) {
        delay(50);
    }

    // Süre doldu, ikinci reset gelmedi — bayrağı temizle
    prefs.begin("dbl_rst", false);
    prefs.putInt("flag", 0);
    prefs.end();
    Serial.println("[DoubleReset] Pencere doldu, normal boot.");
    return false;
}

// ─────────────────────────────────────────────
// NVS Yardımcıları
// ─────────────────────────────────────────────

void saveToNVS() {
    prefs.begin(NVS_NAMESPACE, false);
    prefs.putString("wifi_ssid",   g_wifiSsid);
    prefs.putString("wifi_pass",   g_wifiPass);
    // http:// → https:// otomatik düzelt
    if (g_serverUrl.startsWith("http://") && !g_serverUrl.startsWith("http://192.") && !g_serverUrl.startsWith("http://10.") && !g_serverUrl.startsWith("http://172.")) {
        g_serverUrl.replace("http://", "https://");
    }
    prefs.putString("server_url",  g_serverUrl);
    prefs.putString("esp32_tag",   g_esp32Tag);
    prefs.putString("device_type", g_deviceType);
    prefs.putInt   ("esp32_id",    g_esp32Id);
    prefs.putString("device_id",   g_deviceId);
    prefs.end();
    Serial.println("[NVS] Ayarlar kaydedildi.");
}

void loadFromNVS() {
    prefs.begin(NVS_NAMESPACE, true);
    g_wifiSsid   = prefs.getString("wifi_ssid",   "");
    g_wifiPass   = prefs.getString("wifi_pass",   "");
    g_serverUrl  = prefs.getString("server_url",  "");
    g_esp32Tag   = prefs.getString("esp32_tag",   "");
    g_deviceType = prefs.getString("device_type", "");
    g_esp32Id    = prefs.getInt   ("esp32_id",     0);
    g_deviceId   = prefs.getString("device_id",  "");
    // Kaydedilmiş URL http:// ise ve public URL ise https'e çevir
    if (g_serverUrl.startsWith("http://") &&
        !g_serverUrl.startsWith("http://192.") &&
        !g_serverUrl.startsWith("http://10.") &&
        !g_serverUrl.startsWith("http://172.") &&
        !g_serverUrl.startsWith("http://localhost")) {
        g_serverUrl.replace("http://", "https://");
        Serial.println("[NVS] URL https'e duzeltildi.");
    }
    prefs.end();
}

void saveEsp32IdToNVS(int32_t id) {
    prefs.begin(NVS_NAMESPACE, false);
    prefs.putInt("esp32_id", id);
    prefs.end();
    g_esp32Id = id;
}

void saveDeviceIdToNVS(String deviceId) {
    prefs.begin(NVS_NAMESPACE, false);
    prefs.putString("device_id", deviceId);
    prefs.end();
    g_deviceId = deviceId;
    Serial.printf("[Config] device_id=%s NVS'e kaydedildi.\n", deviceId.c_str());
}

// Tüm ayarları sil (çift reset sonrası)
void clearAllNVS() {
    prefs.begin(NVS_NAMESPACE, false);
    prefs.clear();
    prefs.end();
    g_wifiSsid   = "";
    g_wifiPass   = "";
    g_serverUrl  = "";
    g_esp32Tag   = "";
    g_deviceType = "";
    g_esp32Id    = 0;
    g_deviceId   = "";
    Serial.println("[NVS] Tum ayarlar silindi.");
}

// ─────────────────────────────────────────────
// Wi-Fi Bağlantısı
// ─────────────────────────────────────────────

bool connectWifi() {
    if (g_wifiSsid.isEmpty()) {
        Serial.println("[WiFi] SSID bos.");
        return false;
    }
    Serial.printf("[WiFi] Baglanıyor: %s\n", g_wifiSsid.c_str());
    WiFi.mode(WIFI_STA);
    WiFi.begin(g_wifiSsid.c_str(), g_wifiPass.c_str());

    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED) {
        if (millis() - start > (unsigned long)WIFI_CONNECT_TIMEOUT_S * 1000UL) {
            Serial.println("\n[WiFi] Zaman asimi.");
            WiFi.disconnect(true);
            return false;
        }
        delay(500);
        Serial.print(".");
    }
    Serial.printf("\n[WiFi] Baglandi. IP: %s\n", WiFi.localIP().toString().c_str());
    g_wifiFailCount = 0;
    return true;
}

// ─────────────────────────────────────────────
// Cihaz Kaydı
// ─────────────────────────────────────────────

bool registerDevice() {
    String url = g_serverUrl + "/api/esp32/register";
    Serial.printf("[Register] POST %s\n", url.c_str());

    for (int attempt = 1; attempt <= REGISTER_RETRY_LIMIT; attempt++) {
        Serial.printf("[Register] Deneme %d/%d\n", attempt, REGISTER_RETRY_LIMIT);

        HTTPClient http;
        http.begin(url);
        http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
        http.addHeader("Content-Type", "application/json");
        http.addHeader("ngrok-skip-browser-warning", "1");

        JsonDocument doc;
        doc["esp32_tag"]        = g_esp32Tag;
        doc["device_type"]      = g_deviceType;
        doc["model"]            = DEVICE_MODEL;
        doc["mac_address"]      = WiFi.macAddress();
        doc["firmware_version"] = FIRMWARE_VERSION;

        String body;
        serializeJson(doc, body);

        int httpCode = http.POST(body);
        Serial.printf("[Register] HTTP %d\n", httpCode);

        if (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_CREATED) {
            String payload = http.getString();
            http.end();

            JsonDocument resp;
            if (!deserializeJson(resp, payload) && !resp["esp32_id"].isNull()) {
                int32_t newId = resp["esp32_id"].as<int32_t>();
                saveEsp32IdToNVS(newId);
                Serial.printf("[Register] Basarili! esp32_id=%d\n", newId);
                return true;
            }
            Serial.println("[Register] Yanit parse hatasi.");
        } else {
            http.end();
        }

        if (attempt < REGISTER_RETRY_LIMIT) {
            Serial.printf("[Register] %d ms bekleniyor...\n", REGISTER_RETRY_DELAY_MS);
            delay(REGISTER_RETRY_DELAY_MS);
        }
    }
    Serial.println("[Register] 3 deneme basarisiz.");
    return false;
}

// ─────────────────────────────────────────────
// Heartbeat
// ─────────────────────────────────────────────

void sendHeartbeat() {
    if (g_esp32Id <= 0 || WiFi.status() != WL_CONNECTED) return;

    String url = g_serverUrl + "/api/esp32/heartbeat";
    HTTPClient http;
    http.begin(url);
    http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("ngrok-skip-browser-warning", "1");

    JsonDocument doc;
    doc["esp32_id"]         = g_esp32Id;
    doc["ip_address"]       = WiFi.localIP().toString();
    doc["firmware_version"] = FIRMWARE_VERSION;
    if (g_sendConfigAck) {
        doc["config_ack"] = true;
        g_sendConfigAck = false;  // Sadece bir kez gönder
    }
    // device_status teyidi — ESP32 hangi status'u aldığını bildiriyor
    if (g_sendStatusAck && g_pendingStatusAck.length() > 0) {
        doc["device_status_ack"] = g_pendingStatusAck;
        g_sendStatusAck = false;
        g_pendingStatusAck = "";
        Serial.printf("[Heartbeat] device_status_ack=%s gonderildi.\n",
                      g_pendingStatusAck.c_str());
    }

    String body;
    serializeJson(doc, body);

    int httpCode = http.POST(body);
    Serial.printf("[Heartbeat] HTTP %d\n", httpCode);

    if (httpCode == HTTP_CODE_OK) {
        String payload = http.getString();
        http.end();
        JsonDocument resp;
        if (!deserializeJson(resp, payload)) {
            Serial.printf("[Heartbeat] status=%s\n",
                          resp["status"].as<const char*>());
            // Config alanı var mı kontrol et
            if (!resp["config"].isNull()) {
                JsonObject cfg = resp["config"].as<JsonObject>();
                // Tum config'i Serial'e yaz
                String cfgStr;
                serializeJsonPretty(cfg, cfgStr);
                Serial.println("[Config] Yeni yapilandirma alindi:");
                Serial.println(cfgStr);
                // device_id NVS'e kaydet
                const char* did = cfg["device_id"] | "";
                if (strlen(did) > 0) {
                    saveDeviceIdToNVS(String(did));
                }
                // device_status oku, kaydet ve teyit gönderilecek şekilde işaretle
                const char* dstatus = cfg["device_status"] | "";
                if (strlen(dstatus) > 0) {
                    g_deviceStatus = String(dstatus);
                    Serial.printf("[Config] Cihaz durumu: %s\n", dstatus);
                    if (g_deviceStatus == "offline") {
                        Serial.println("[Config] Cihaz pasif — veri gonderimi durduruldu.");
                    } else {
                        Serial.println("[Config] Cihaz aktif — veri gonderimi basliyor.");
                    }
                    // Bir sonraki HB'de device_status_ack gönder
                    g_sendStatusAck    = true;
                    g_pendingStatusAck = g_deviceStatus;
                }
                // dataRegisters + coils parse — full config veya diff config
                bool isDiff = cfg["diff"] | false;
                if (isDiff) {
                    if (!cfg["changed"].isNull()) {
                        JsonObject changed = cfg["changed"].as<JsonObject>();
                        if (!changed["dataRegisters"].isNull()) {
                            parseDataRegisters(changed["dataRegisters"].as<JsonArray>());
                            Serial.println("[Config] Diff: dataRegisters guncellendi.");
                        }
                        if (!changed["coils"].isNull()) {
                            parseCoils(changed["coils"].as<JsonArray>());
                            Serial.println("[Config] Diff: coils guncellendi.");
                        }
                    }
                } else {
                    if (!cfg["plc_io_config"].isNull()) {
                        JsonObject plcIo = cfg["plc_io_config"].as<JsonObject>();
                        if (!plcIo["dataRegisters"].isNull()) {
                            parseDataRegisters(plcIo["dataRegisters"].as<JsonArray>());
                            Serial.println("[Config] Full: dataRegisters yuklendi.");
                        }
                        if (!plcIo["coils"].isNull()) {
                            parseCoils(plcIo["coils"].as<JsonArray>());
                            Serial.println("[Config] Full: coils yuklendi.");
                        }
                    }
                }
                if (!cfg["modbus_config"].isNull()) {
                    JsonObject mCfg = cfg["modbus_config"].as<JsonObject>();
                    g_slaveId       = mCfg["slaveId"] | 1;
                    g_baudRate      = mCfg["baudRate"] | 9600;
                    g_readInterval  = mCfg["readInterval"] | 1000;
                    g_modbusTimeout = mCfg["timeout"] | 500;
                    g_retryCount    = mCfg["retryCount"] | 2;
                    Serial.printf("[Modbus] Config: slave=%d baud=%d interval=%d timeout=%d retry=%d\n",
                                  g_slaveId, g_baudRate, g_readInterval, g_modbusTimeout, g_retryCount);
                    // Modbus'u yeniden başlat (baud rate değişmiş olabilir)
                    if (g_modbusReady) {
                        Serial2.end();
                    }
                    setupModbus();
                }
                // Bir sonraki heartbeat'e config ACK ekle
                g_sendConfigAck = true;
            }
        }
    } else if (httpCode == 404) {
        http.end();
        Serial.println("[Heartbeat] 404 - ID gecersiz, yeniden kayit.");
        saveEsp32IdToNVS(0);
        if (!registerDevice()) {
            g_apMode = true;
            startAPMode();
        }
    } else {
        http.end();
    }
}

// ─────────────────────────────────────────────
// Modbus RTU Master
// ─────────────────────────────────────────────

DataType parseDataType(const char* dt) {
    if (strcmp(dt, "INT") == 0)  return DT_INT;
    if (strcmp(dt, "DW") == 0)   return DT_DW;
    if (strcmp(dt, "DINT") == 0) return DT_DINT;
    if (strcmp(dt, "FLT") == 0)  return DT_FLT;
    return DT_W;  // Varsayılan
}

uint8_t getWordSizeFromType(DataType dt) {
    return (dt >= DT_DW) ? 2 : 1;
}

void setupModbus() {
    Serial2.begin(g_baudRate, SERIAL_8N1, RS485_RX, RS485_TX);
    mb.begin(&Serial2, RS485_DE);
    mb.master();
    g_modbusReady = true;
    Serial.printf("[Modbus] Baslatildi. Slave=%d Baud=%d\n", g_slaveId, g_baudRate);
}

void parseDataRegisters(JsonArray arr) {
    g_regTable.count = 0;
    g_regTable.totalWords = 0;

    for (JsonObject obj : arr) {
        if (g_regTable.count >= 64) break;

        RegisterEntry& entry = g_regTable.entries[g_regTable.count];
        entry.address = obj["registerAddress"] | 0;
        strncpy(entry.plcTag, obj["plcTag"] | "", 11);
        entry.plcTag[11] = '\0';

        const char* dt = obj["dataType"] | "W";
        entry.dataType = parseDataType(dt);

        g_regTable.totalWords += getWordSizeFromType(entry.dataType);
        g_regTable.count++;
    }

    if (g_regTable.count > 0) {
        g_regTable.startAddr = g_regTable.entries[0].address;
        Serial.printf("[Modbus] %d register yapilandi. Baslangic=%d, ToplamWord=%d\n",
                      g_regTable.count, g_regTable.startAddr, g_regTable.totalWords);
    }
}

void parseCoils(JsonArray arr) {
    g_coilTable.count = 0;

    for (JsonObject obj : arr) {
        if (g_coilTable.count >= 128) break;

        CoilEntry& entry = g_coilTable.entries[g_coilTable.count];
        entry.address = obj["coilAddress"] | 0;
        strncpy(entry.plcTag, obj["plcTag"] | "", 11);
        entry.plcTag[11] = '\0';

        g_coilTable.count++;
    }

    if (g_coilTable.count > 0) {
        g_coilTable.startAddr = g_coilTable.entries[0].address;
        Serial.printf("[Modbus] %d coil yapilandi. Baslangic=%d\n",
                      g_coilTable.count, g_coilTable.startAddr);
    }
}



// ─────────────────────────────────────────────
// Modbus Sıralı Okuma — Çakışmasız Tek İşlem
// ─────────────────────────────────────────────
// Mühendislik yaklaşımı: Half-duplex RS485 hattında
// bir anda tek istek olmalı. Önce Coil (FC01), yanıt
// alındıktan sonra Register (FC03), ardından veri gönderimi.

bool modbusWaitResponse(uint32_t timeoutMs) {
    unsigned long start = millis();
    while (mb.slave()) {
        mb.task();
        if (millis() - start > timeoutMs) return false;
        delay(1);
    }
    return true;
}

bool modbusReadCoils() {
    if (g_coilTable.count == 0) return true;  // Okuma gerekmiyor, başarılı say

    uint16_t startAddr = g_coilTable.startAddr;
    uint8_t  count     = min((uint8_t)128, g_coilTable.count);

    for (uint8_t attempt = 0; attempt <= g_retryCount; attempt++) {
        if (mb.readCoil(g_slaveId, startAddr, g_coilBuffer, count)) {
            if (modbusWaitResponse(g_modbusTimeout)) {
                return true;
            }
        }
        if (attempt < g_retryCount) {
            Serial.printf("[Modbus] Coil retry %d/%d\n", attempt + 1, g_retryCount);
            delay(50);
        }
    }
    Serial.println("[Modbus] Coil okuma basarisiz.");
    return false;
}

bool modbusReadRegisters() {
    if (g_regTable.count == 0) return true;  // Okuma gerekmiyor

    uint16_t startAddr = g_regTable.startAddr;
    uint16_t wordCount = min((uint16_t)128, g_regTable.totalWords);

    for (uint8_t attempt = 0; attempt <= g_retryCount; attempt++) {
        if (mb.readHreg(g_slaveId, startAddr, g_regBuffer, wordCount)) {
            if (modbusWaitResponse(g_modbusTimeout)) {
                return true;
            }
        }
        if (attempt < g_retryCount) {
            Serial.printf("[Modbus] Reg retry %d/%d\n", attempt + 1, g_retryCount);
            delay(50);
        }
    }
    Serial.println("[Modbus] Register okuma basarisiz.");
    return false;
}

void readModbusAndSend() {
    if (!g_modbusReady) return;
    if (g_deviceStatus == "offline") return;
    if (g_coilTable.count == 0 && g_regTable.count == 0) return;

    // Adım 1: Coil oku (FC01) — yanıt gelene kadar bekle
    bool coilOk = modbusReadCoils();

    // Adım 2: Küçük bekleme — hat boşalsın (turnaround delay)
    delay(20);

    // Adım 3: Register oku (FC03) — yanıt gelene kadar bekle
    bool regOk = modbusReadRegisters();

    // Adım 4: Herhangi biri başarılıysa sunucuya gönder
    if (coilOk || regOk) {
        sendDataToServer();
    }
}

void sendDataToServer() {
    if (g_deviceId.isEmpty() || g_deviceStatus == "offline") return;
    if (WiFi.status() != WL_CONNECTED) return;

    String url = g_serverUrl + "/api/device-data";
    HTTPClient http;
    http.begin(url);
    http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("ngrok-skip-browser-warning", "1");

    JsonDocument doc;
    doc["deviceId"]  = g_deviceId;
    doc["type"]      = "plc";
    doc["subtype"]   = "dvp_ss2";
    doc["timestamp"] = "";

    JsonObject data = doc["data"].to<JsonObject>();

    // Coil verileri (ON/OFF)
    if (g_coilTable.count > 0) {
        JsonObject coils = data["coils"].to<JsonObject>();
        for (uint8_t i = 0; i < g_coilTable.count; i++) {
            coils[g_coilTable.entries[i].plcTag] = g_coilBuffer[i] ? "1" : "0";
        }
    }

    JsonObject regs = data["dataRegisters"].to<JsonObject>();

    // Her register'ı buffer'dan oku ve dataType'a göre parse et
    uint16_t bufOffset = 0;
    for (uint8_t i = 0; i < g_regTable.count; i++) {
        RegisterEntry& entry = g_regTable.entries[i];
        uint8_t ws = getWordSizeFromType(entry.dataType);

        switch (entry.dataType) {
            case DT_W: {
                uint16_t val = g_regBuffer[bufOffset];
                regs[entry.plcTag] = val;
                break;
            }
            case DT_INT: {
                int16_t val = (int16_t)g_regBuffer[bufOffset];
                regs[entry.plcTag] = val;
                break;
            }
            case DT_DW: {
                // Delta DVP: LOW WORD = regs[0], HIGH WORD = regs[1]
                uint32_t val = ((uint32_t)g_regBuffer[bufOffset + 1] << 16) | (uint32_t)g_regBuffer[bufOffset];
                regs[entry.plcTag] = val;
                break;
            }
            case DT_DINT: {
                uint32_t raw = ((uint32_t)g_regBuffer[bufOffset + 1] << 16) | (uint32_t)g_regBuffer[bufOffset];
                int32_t val = (int32_t)raw;
                regs[entry.plcTag] = val;
                break;
            }
            case DT_FLT: {
                uint32_t raw = ((uint32_t)g_regBuffer[bufOffset + 1] << 16) | (uint32_t)g_regBuffer[bufOffset];
                float val;
                memcpy(&val, &raw, sizeof(float));
                regs[entry.plcTag] = val;
                break;
            }
        }
        bufOffset += ws;
    }

    String body;
    serializeJson(doc, body);

    int httpCode = http.POST(body);
    if (httpCode == HTTP_CODE_OK) {
        Serial.printf("[Data] %d register gonderildi.\n", g_regTable.count);
    } else {
        Serial.printf("[Data] HTTP %d — gonderilemedi.\n", httpCode);
    }
    http.end();
}

// ─────────────────────────────────────────────
// AP Mode — HTML Form
// ─────────────────────────────────────────────

String buildWifiOptions() {
    int n = WiFi.scanNetworks();
    String opts = "";
    for (int i = 0; i < n; i++) {
        String ssid = WiFi.SSID(i);
        opts += "<option value=\"" + ssid + "\">" + ssid +
                " (" + String(WiFi.RSSI(i)) + " dBm)</option>\n";
    }
    if (opts.isEmpty())
        opts = "<option value=''>-- Ag bulunamadi --</option>\n";
    return opts;
}

String buildProvisioningPage(const String& statusMsg) {
    String wifiOpts = buildWifiOptions();

    String statusHtml = "";
    if (!statusMsg.isEmpty()) {
        String color = statusMsg.startsWith("HATA") ? "#c0392b" : "#27ae60";
        statusHtml = "<div style='background:" + color +
                     ";color:#fff;padding:10px;border-radius:6px;"
                     "margin-bottom:16px;'>" + statusMsg + "</div>";
    }

    String html =
        "<!DOCTYPE html><html lang='tr'><head>"
        "<meta charset='UTF-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<title>ESP32 Kurulum</title><style>"
        "body{font-family:sans-serif;background:#1a1a2e;color:#eee;"
        "display:flex;justify-content:center;align-items:center;"
        "min-height:100vh;margin:0}"
        ".card{background:#16213e;padding:28px;border-radius:12px;"
        "width:100%;max-width:440px;box-shadow:0 4px 24px rgba(0,0,0,.5)}"
        "h2{margin:0 0 4px;color:#e94560}"
        ".sub{font-size:.78em;color:#666;margin-bottom:16px}"
        ".hint{font-size:.78em;color:#e94560;background:#2a1020;"
        "padding:8px 12px;border-radius:6px;margin-bottom:14px}"
        "label{display:block;margin:12px 0 4px;font-size:.88em;color:#aaa}"
        "input,select{width:100%;padding:9px 11px;border-radius:6px;"
        "border:1px solid #0f3460;background:#0f3460;color:#eee;"
        "font-size:.95em;box-sizing:border-box}"
        "button{width:100%;padding:11px;margin-top:20px;background:#e94560;"
        "color:#fff;border:none;border-radius:6px;font-size:1em;cursor:pointer}"
        "button:hover{background:#c0392b}"
        "</style></head><body><div class='card'>"
        "<h2>OFK SCADA — ESP32 Kurulum</h2>"
        "<div class='sub'>v" + String(FIRMWARE_VERSION) +
        " | MAC: " + WiFi.macAddress() + "</div>"
        "<div class='hint'>RST butonuna 2 kez kisa basarak bu ekrana ulasabilirsiniz.</div>";

    html += statusHtml;

    html +=
        "<form method='POST' action='/setup'>"
        "<label>Wi-Fi Agi</label>"
        "<select name='ssid'>" + wifiOpts + "</select>"
        "<label>Wi-Fi Sifre</label>"
        "<input type='password' name='pass' placeholder='sifre'>"
        "<label>Sunucu URL</label>"
        "<input type='text' name='server_url' "
        "placeholder='https://uncommercial-braiden-prealtar.ngrok-free.dev' "
        "value='" + (g_serverUrl.isEmpty() ? String("https://uncommercial-braiden-prealtar.ngrok-free.dev") : g_serverUrl) + "' required>"
        "<label>ESP32 Tag</label>"
        "<input type='text' name='esp32_tag' "
        "placeholder='Fabrika-ESP32-01' value='" + g_esp32Tag + "' required>"
        "<label>Cihaz Turu</label>"
        "<input type='text' name='device_type' "
        "placeholder='plc' value='" + g_deviceType + "' required>"
        "<button type='submit'>Baglan &amp; Kayit Ol</button>"
        "</form></div></body></html>";

    return html;
}

void handleRoot() {
    apServer.send(200, "text/html; charset=utf-8", buildProvisioningPage());
}

void handleProvisioningForm() {
    if (!apServer.hasArg("ssid") || !apServer.hasArg("server_url") ||
        !apServer.hasArg("esp32_tag") || !apServer.hasArg("device_type")) {
        apServer.send(400, "text/plain", "Eksik alan.");
        return;
    }

    String ssid       = apServer.arg("ssid");
    String pass       = apServer.arg("pass");
    String serverUrl  = apServer.arg("server_url");
    String esp32Tag   = apServer.arg("esp32_tag");
    String deviceType = apServer.arg("device_type");

    if (ssid.isEmpty() || serverUrl.isEmpty() ||
        esp32Tag.isEmpty() || deviceType.isEmpty()) {
        apServer.send(200, "text/html; charset=utf-8",
            buildProvisioningPage("HATA: Tum zorunlu alanlari doldurun."));
        return;
    }

    g_wifiSsid   = ssid;
    g_wifiPass   = pass;
    g_serverUrl  = serverUrl;
    g_esp32Tag   = esp32Tag;
    g_deviceType = deviceType;
    g_esp32Id    = 0;
    saveToNVS();

    apServer.send(200, "text/html; charset=utf-8",
        "<html><head><meta charset='UTF-8'></head>"
        "<body style='font-family:sans-serif;background:#1a1a2e;color:#eee;"
        "text-align:center;padding-top:60px;'>"
        "<h2 style='color:#e94560;'>Baglanti deneniyor...</h2>"
        "<p>Lutfen bekleyin.</p></body></html>");

    delay(300);
    apServer.stop();
    WiFi.softAPdisconnect(true);
    g_provisioning = true;
    g_apMode = false;

    if (!connectWifi()) {
        g_provisioning = false;
        g_apMode = true;
        startAPMode();
        return;
    }

    if (!registerDevice()) {
        g_provisioning = false;
        g_apMode = true;
        startAPMode();
        return;
    }

    Serial.println("[Provisioning] Basarili! Heartbeat moduna geciliyor.");
    g_provisioning = false;
    g_lastHeartbeat = millis();
}

void startAPMode() {
    Serial.println("[AP] AP modu baslatiliyor: ESP32-Setup");
    WiFi.mode(WIFI_AP);
    WiFi.softAP("ESP32-Setup");
    delay(500);

    IPAddress apIP(192, 168, 4, 1);
    WiFi.softAPConfig(apIP, apIP, IPAddress(255, 255, 255, 0));
    Serial.printf("[AP] IP: %s\n", WiFi.softAPIP().toString().c_str());

    apServer.on("/",      HTTP_GET,  handleRoot);
    apServer.on("/setup", HTTP_POST, handleProvisioningForm);
    apServer.onNotFound([]() {
        apServer.sendHeader("Location", "/");
        apServer.send(302, "text/plain", "");
    });
    apServer.begin();
    Serial.println("[AP] HTTP sunucu baslatildi.");
    g_apMode = true;
}

// ─────────────────────────────────────────────
// Wi-Fi Kopma Takibi
// ─────────────────────────────────────────────

void handleWifiReconnect() {
    if (g_apMode || g_provisioning) return;
    if (WiFi.status() == WL_CONNECTED) {
        g_wifiFailCount = 0;
        return;
    }

    unsigned long now = millis();
    if (now - g_lastWifiRetry <
        (unsigned long)WIFI_RECONNECT_INTERVAL_S * 1000UL) return;
    g_lastWifiRetry = now;

    g_wifiFailCount++;
    Serial.printf("[WiFi] Koptu. Deneme %d/%d\n", g_wifiFailCount, WIFI_MAX_FAIL);

    WiFi.reconnect();
    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 8000UL) {
        delay(500);
        Serial.print(".");
    }
    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("[WiFi] Yeniden baglandi.");
        g_wifiFailCount = 0;
    } else if (g_wifiFailCount >= WIFI_MAX_FAIL) {
        Serial.println("[WiFi] 5 basarisiz -> restart (devam modunda acilir).");
        delay(500);
        ESP.restart();
    }
}

// ─────────────────────────────────────────────
// setup() ve loop()
// ─────────────────────────────────────────────

void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println("\n[OFK SCADA] ESP32 Firmware " FIRMWARE_VERSION " baslatiliyor...");

    // ── Çift reset kontrolü (3 sn pencere) ───────────────
    bool doubleReset = checkDoubleReset();

    // ── NVS'den ayarları yükle ────────────────────────────
    loadFromNVS();
    Serial.printf("[NVS] ssid='%s'  esp32_id=%d\n",
                  g_wifiSsid.c_str(), g_esp32Id);

    if (doubleReset) {
        // Çift reset → tüm NVS'yi temizle, AP moduna geç
        Serial.println("[Setup] NVS temizleniyor...");
        clearAllNVS();
        startAPMode();
        return;
    }

    // ── Tek reset / güç kesintisi → kaldığı yerden devam ─
    Serial.println("[Setup] Normal boot -> kaldigi yerden devam.");

    if (g_wifiSsid.isEmpty()) {
        Serial.println("[Setup] Wi-Fi bilgisi yok -> AP modu.");
        startAPMode();
        return;
    }

    if (!connectWifi()) {
        Serial.println("[Setup] Wi-Fi basarisiz -> AP modu.");
        startAPMode();
        return;
    }

    if (g_esp32Id <= 0) {
        Serial.println("[Setup] ID yok -> kayit baslatiliyor.");
        if (!registerDevice()) {
            Serial.println("[Setup] Kayit basarisiz -> AP modu.");
            startAPMode();
            return;
        }
    } else {
        Serial.printf("[Setup] Mevcut esp32_id=%d ile devam.\n", g_esp32Id);
    }

    g_lastHeartbeat = millis();
    // Modbus başlat (config gelince ayarlar güncellenecek)
    setupModbus();
    Serial.println("[Setup] Heartbeat moduna hazir.");
}

void loop() {
    if (g_apMode) {
        apServer.handleClient();
        return;
    }

    if (g_provisioning) {
        delay(100);
        return;
    }

    handleWifiReconnect();

    unsigned long now = millis();
    if (now - g_lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
        g_lastHeartbeat = now;
        sendHeartbeat();
    }

    // Modbus periyodik okuma — sıralı, çakışmasız
    if (g_modbusReady && g_deviceStatus != "offline") {
        if (now - g_lastModbusRead >= g_readInterval) {
            g_lastModbusRead = now;
            readModbusAndSend();
        }
    }

    // Modbus task — iç işlemleri yürüt
    if (g_modbusReady) {
        mb.task();
    }

    delay(50);
}
