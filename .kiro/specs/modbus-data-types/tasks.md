# Uygulama Planı: Modbus Veri Tipleri

## Genel Bakış

Mevcut `length` tabanlı Data Register yapısını `dataType` tabanlı sisteme geçiriyoruz. Frontend'de otomatik adres hesaplama ve veri tipi seçimi, backend'de şema güncellemesi ve geriye uyumluluk, ESP32'de Modbus RTU okuma ve veri gönderimi ekleniyor. Uygulama sırası: yardımcı fonksiyonlar → frontend UI → backend → firmware.

## Görevler

- [ ] 1. Çekirdek yardımcı fonksiyonlar ve veri tipi sabitleri
  - [ ] 1.1 `deviceCatalog.js` dosyasına `DATA_TYPE_OPTIONS` dizisini ekle
    - `value`, `label`, `desc`, `wordSize`, `range` alanlarıyla 5 veri tipi tanımla (W, INT, DW, DINT, FLT)
    - Mevcut deprecated `DATA_TYPES` dizisini koru (geriye uyumluluk)
    - `DEFAULT_MODBUS_TIMING` sabitini ekle: `{ readInterval: 1000, timeout: 500, retryCount: 2 }`
    - _Gereksinimler: 1.2, 4.1, 4.2, 4.3_

  - [ ] 1.2 `plcIoUtils.js` dosyasında `DEFAULT_REGISTER_ROW` güncelle ve yeni fonksiyonlar ekle
    - `DEFAULT_REGISTER_ROW`: `length: 1` → `dataType: "W"` olarak değiştir
    - `getWordSize(dataType)` fonksiyonu ekle: DW/DINT/FLT → 2, diğerleri → 1
    - `computeAutoAddresses(registers, startAddress)` fonksiyonu ekle
    - `computeTotalWords(registers)` fonksiyonu ekle
    - `clampValue(value, min, max)` fonksiyonu ekle
    - `migrateLegacyRegisters(registers)` fonksiyonu ekle: length→dataType dönüşümü
    - _Gereksinimler: 1.3, 2.2, 2.3, 2.4, 2.5, 3.3, 4.4, 5.5, 8.2_

  - [ ]* 1.3 Property testleri yaz: adres hesaplama ve dönüşüm fonksiyonları
    - **Property 1: Adres Hesaplama Tutarlılığı**
    - **Property 2: PLC Tag Otomatik Üretimi**
    - **Property 3: Adres Çakışmasızlık Değişmezi**
    - **Property 4: Toplam Word Sayısı Doğruluğu**
    - **Property 5: Değer Sınırlama (Clamping)**
    - **Property 6: dataType → Word Boyutu Eşlemesi**
    - **Property 9: Geriye Uyumluluk Dönüşümü**
    - **Doğrular: Gereksinim 2.2, 2.3, 2.4, 2.5, 3.1, 3.3, 4.4, 5.5, 8.2**

- [ ] 2. Checkpoint — Yardımcı fonksiyonlar
  - Tüm testlerin geçtiğinden emin ol, sorular varsa kullanıcıya sor.

- [ ] 3. Frontend UI güncellemeleri
  - [ ] 3.1 `PlcIoConfigForm.jsx` içinde `REGISTER_COLUMNS` güncelle
    - `length` sütununu kaldır, yerine `dataType` sütunu ekle (type: 'select')
    - `plcTag` ve `registerAddress` (ilk satır hariç) sütunlarını readOnly yap
    - Toplam word badge'ini IoSection başlığına ekle
    - _Gereksinimler: 1.1, 1.4, 3.3_

  - [ ] 3.2 `IoSection` bileşeninde `select` tipi ve `readOnly` desteği ekle
    - `type: 'select'` için `<select>` elemanı render et (options'dan)
    - Her option'da açıklama tooltip veya alt metin göster
    - `readOnly` prop'una göre input'ları disabled yap
    - _Gereksinimler: 1.2, 1.4, 2.1_

  - [ ] 3.3 Otomatik adres hesaplama mantığını `PlcIoConfigForm`'a entegre et
    - `dataRegisters` her değiştiğinde `computeAutoAddresses` çağır
    - İlk satırın `registerAddress` değiştiğinde tüm listeyi yeniden hesapla
    - Herhangi satırın `dataType` değişiminde altındaki satırları güncelle
    - `onChange` callback'inde hesaplanmış değerleri kullan
    - _Gereksinimler: 2.2, 2.3, 2.4, 2.5_

  - [ ] 3.4 Modbus iletişim ayarları panelini ekle
    - `readInterval`, `timeout`, `retryCount` alanları ekle (modbus_config kartına)
    - Her alan için min/max sınırları ve varsayılan değerleri uygula
    - `clampValue` kullanarak aralık dışı girişleri düzelt
    - _Gereksinimler: 4.1, 4.2, 4.3, 4.4_

  - [ ] 3.5 Geriye uyumluluk: veri yükleme sırasında legacy dönüşüm
    - `normalizeConfig` içinde `migrateLegacyRegisters` çağır
    - Eski format (`length` alanı var) kayıtları otomatik dönüştür
    - Mevcut coil yapılandırmasına dokunma
    - _Gereksinimler: 8.2, 8.3_

  - [ ]* 3.6 Unit testler: PlcIoConfigForm ve IoSection render testleri
    - dataType select render kontrolü
    - readOnly alanlar kontrolü
    - Toplam word badge doğrulaması
    - Legacy veri yükleme senaryosu
    - _Gereksinimler: 1.1, 1.2, 1.3, 8.2_

- [ ] 4. Checkpoint — Frontend tamamlandı
  - Tüm testlerin geçtiğinden emin ol, sorular varsa kullanıcıya sor.

- [ ] 5. Backend güncellemeleri
  - [ ] 5.1 `diff_engine.py` dosyasında `_ESP32_REG_FIELDS` güncelle
    - `{"plcTag", "registerAddress", "length"}` → `{"plcTag", "registerAddress", "dataType"}` olarak değiştir
    - `build_full_config_payload` içinde legacy dönüşüm ekle (length varsa → dataType'a çevir)
    - `modbus_config` payload'una timing alanlarını (readInterval, timeout, retryCount) ekle
    - _Gereksinimler: 5.1, 5.2, 5.3, 5.5, 8.1_

  - [ ] 5.2 Backend şema doğrulamalarını güncelle
    - `DeviceDataPayload` şemasında yeni `data.dataRegisters` formatını kabul et (PLC Tag anahtarlı nesne)
    - `plc_io_config` kayıt sırasında `dataType` alanını doğrula (enum: W, INT, DW, DINT, FLT)
    - `length` alanını opsiyonel yap (geriye uyumluluk)
    - _Gereksinimler: 5.1, 5.2, 8.1_

  - [ ]* 5.3 Backend integration testleri
    - diff_engine: `_ESP32_REG_FIELDS` ile dataType alanının doğru gönderilmesi
    - Eski format (length) ile yeni format (dataType) karışık senaryo
    - `build_full_config_payload` çıktısında modbus timing alanları kontrolü
    - _Gereksinimler: 5.1, 5.3, 8.1_

- [ ] 6. Checkpoint — Backend tamamlandı
  - Tüm testlerin geçtiğinden emin ol, sorular varsa kullanıcıya sor.

- [ ] 7. ESP32 Firmware — Modbus RTU Master
  - [ ] 7.1 Modbus kütüphane entegrasyonu ve pin konfigürasyonu
    - `#include <ModbusRTU.h>` ekle (emeliart/modbus-esp8266)
    - RS485 pin tanımları: RX=GPIO16, TX=GPIO17, DE/RE=GPIO4
    - `setupModbus()` fonksiyonu yaz: Serial2 başlat, ModbusRTU master modu
    - `setup()` içinde WiFi bağlantısından sonra `setupModbus()` çağır
    - _Gereksinimler: 6.1_

  - [ ] 7.2 Config parse ve register tablosu oluşturma
    - `DataType` enum ve `RegisterEntry`, `RegisterTable` struct'ları tanımla
    - `parseDataRegisters(JsonArray)` fonksiyonu yaz
    - Heartbeat config yanıtında `plc_io_config.dataRegisters` parse et
    - Global `g_regTable` değişkenini doldur
    - _Gereksinimler: 6.2_

  - [ ] 7.3 Periyodik register okuma ve veri tipi dönüşümü
    - `readRegisters()` fonksiyonu yaz: FC03 toplu okuma
    - `parseDW()`, `parseDINT()`, `parseFLT()` dönüşüm fonksiyonları yaz (Delta DVP byte sırası)
    - `loop()` içinde `g_readInterval` ms'de bir okuma yap
    - Timeout ve retry mekanizması: `g_timeout` ms bekle, `g_retryCount` kadar tekrarla
    - Tüm retry başarısızsa hata logla, sonraki periyoda geç
    - `g_deviceStatus == "offline"` ise okuma yapma
    - _Gereksinimler: 6.3, 6.4, 6.5, 6.6, 6.7_

  - [ ] 7.4 Sunucuya veri gönderimi
    - `sendDataToServer()` fonksiyonu yaz
    - JSON payload: `deviceId`, `timestamp`, `type: "plc"`, `subtype: "dvp_ss2"`, `data.dataRegisters`
    - Her register değerini PLC Tag anahtarıyla gönder (D0, D1, D2, ...)
    - HTTP POST `/api/device-data` endpoint'ine gönder
    - `g_deviceStatus == "offline"` ise gönderim yapma
    - HTTP 200 dışı yanıtta hata logla
    - _Gereksinimler: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ] 7.5 Modbus timing konfigürasyonunu heartbeat'ten oku
    - Config yanıtından `modbus_config.readInterval`, `modbus_config.timeout`, `modbus_config.retryCount` parse et
    - Global değişkenlere ata: `g_readInterval`, `g_timeout`, `g_retryCount`
    - Varsayılanlar: 1000ms, 500ms, 2
    - _Gereksinimler: 4.1, 4.2, 4.3, 6.6_

  - [ ]* 7.6 Property testleri: Delta DVP byte sırası ve veri tipi dönüşümü
    - **Property 7: Delta DVP 32-bit Geri Dönüşüm**
    - **Property 8: Veri Tipi Dönüşüm Doğruluğu**
    - **Property 10: Veri Gönderim Payload Bütünlüğü**
    - **Doğrular: Gereksinim 6.4, 6.5, 7.3**

- [ ] 8. Son checkpoint — Tüm katmanlar entegre
  - Tüm testlerin geçtiğinden emin ol, sorular varsa kullanıcıya sor.

## Notlar

- `*` ile işaretli görevler opsiyoneldir ve daha hızlı MVP için atlanabilir
- Her görev belirli gereksinimleri referanslar (izlenebilirlik)
- Checkpoint'ler artımlı doğrulama sağlar
- Property testleri evrensel doğruluk özelliklerini doğrular
- Unit testler spesifik örnekleri ve kenar durumlarını doğrular
- ESP32 firmware testleri için JavaScript eşdeğer fonksiyonlar yazılıp test edilir (gerçek donanım olmadan)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "3.1", "3.2"] },
    { "id": 2, "tasks": ["3.3", "3.4", "3.5"] },
    { "id": 3, "tasks": ["3.6", "5.1"] },
    { "id": 4, "tasks": ["5.2", "5.3"] },
    { "id": 5, "tasks": ["7.1", "7.2"] },
    { "id": 6, "tasks": ["7.3", "7.4", "7.5"] },
    { "id": 7, "tasks": ["7.6"] }
  ]
}
```
