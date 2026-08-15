# OFK SCADA — ESP32 Firmware

Bu klasör, OFK SCADA sistemine ESP32 cihazları entegre etmek için gereken Arduino firmware'ini içerir.

---

## Gereksinimler

### Donanım

- **Board:** ESP32-WROOM-32 veya uyumlu (ESP32-DevKitC, NodeMCU-32S vb.)
- **Arduino IDE:** 2.x önerilir (1.8.x de çalışır)
- **ESP32 Board Paketi:** `espressif/arduino-esp32` v2.x

---

## Arduino IDE Kurulumu

### 1. ESP32 Board Paketini Ekle

1. Arduino IDE'yi aç → **Dosya > Tercihler**
2. "Ek pano yöneticisi URL'leri" alanına şunu ekle:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
3. **Araçlar > Pano > Pano Yöneticisi** → `esp32` ara → **Espressif Systems** paketini kur (v2.x)

### 2. Board Seçimi

**Araçlar > Pano** menüsünden şunu seç:
```
ESP32 Arduino > ESP32 Dev Module
```

Önerilen Araçlar ayarları:
- Upload Speed: `921600`
- CPU Frequency: `240MHz`
- Flash Size: `4MB`
- Partition Scheme: `Default 4MB with spiffs`

---

## Kütüphane Kurulumu

### Otomatik Kütüphaneler (Arduino IDE ile gelir)

| Kütüphane | Kaynak |
|---|---|
| `WiFi.h` | ESP32 board paketine dahil |
| `WebServer.h` | ESP32 board paketine dahil |
| `Preferences.h` | ESP32 board paketine dahil |
| `HTTPClient.h` | ESP32 board paketine dahil |

### Manuel Kurulması Gereken Kütüphane

#### ArduinoJson

**Araçlar > Kütüphane Yöneticisi** → `ArduinoJson` ara → **Benoit Blanchon** tarafından geliştirilen paketi kur:

- **Sürüm:** 6.x (v7.x ile uyumlu değildir, v6 kullan)
- Kütüphane adı: `ArduinoJson`

---

## Yükleme

1. `esp32_scada.ino` dosyasını Arduino IDE ile aç
2. Board ve COM portunu seç
3. **Yükle** butonuna bas (→)

---

## İlk Çalıştırma

1. ESP32'yi USB ile bilgisayara bağla ve Serial Monitor'ü aç (baud: **115200**)
2. Cihaz ilk açılışta `ESP32-Setup` adlı Wi-Fi ağı oluşturur
3. Telefon veya bilgisayardan bu ağa bağlan
4. Tarayıcıdan `http://192.168.4.1` adresine git
5. Formu doldur:
   - **Wi-Fi Ağı:** Listeden seç
   - **Wi-Fi Şifre:** Ağ şifresi
   - **Sunucu URL:** `http://<sunucu-ip>:8000`
   - **ESP32 Tag:** Cihaz adı (örn. `Fabrika-ESP32-01`)
   - **Cihaz Türü:** `sensor`, `plc` vb.
6. "Bağlan & Kayıt Ol" butonuna tıkla
7. Cihaz Wi-Fi'ye bağlanır, sunucuya kaydolur ve her 5 saniyede heartbeat göndermeye başlar

---

## NVS Sıfırlama

Cihazı fabrika ayarlarına döndürmek için Serial Monitor üzerinden `ESP.nvs.erase_all()` çağrısı yapabilir ya da aşağıdaki basit sketch'i yükleyebilirsiniz:

```cpp
#include <Preferences.h>
void setup() {
    Preferences prefs;
    prefs.begin("esp32cfg", false);
    prefs.clear();
    prefs.end();
    Serial.begin(115200);
    Serial.println("NVS temizlendi.");
}
void loop() {}
```

---

## Hata Giderme

| Belirti | Olası Neden | Çözüm |
|---|---|---|
| `ESP32-Setup` ağı görünmüyor | Board yanlış / güç sorunu | Board'u kontrol et, LED yanıp sönüyor mu? |
| Kayıt başarısız (sunucu hatası) | Sunucu URL yanlış | `http://` dahil tam URL gir |
| Heartbeat gönderiyor ama bağlantı görünmüyor | Sunucu Redis'e erişemiyor | `docker-compose up` ile servisleri kontrol et |
| Wi-Fi'ye bağlanamıyor | Yanlış şifre / 5 GHz ağ | ESP32 yalnızca 2.4 GHz destekler |

---

## Sunucu Tarafı

Backend API dokümantasyonu için `GET /docs` adresini ziyaret et (FastAPI otomatik dokümantasyonu).

Endpoint'ler:
- `POST /api/esp32/register` — Cihaz kaydı
- `POST /api/esp32/heartbeat` — Canlılık sinyali
- `GET /api/esp32/devices` — Cihaz listesi (Admin paneli)
