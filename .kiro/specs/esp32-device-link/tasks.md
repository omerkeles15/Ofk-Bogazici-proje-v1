# Uygulama Planı: ESP32 ↔ Cihaz Eşleştirme ve Yapılandırma Gönderimi

## Genel Bakış

Bu plan, ESP32 donanımı ile SCADA cihazlarını birbirine bağlayan çift yönlü referans mekanizmasını ve yapılandırma iletim altyapısını adım adım inşa eder. Uygulama sırası: veri modeli → backend endpointleri → frontend güncellemeleri → firmware güncelleme.

Her adım önceki adım üzerine inşa edilir. Hiçbir kod yalnarda (orphaned) bırakılmaz.

---

## Görevler

- [ ] 1. Veri modeli değişiklikleri ve şema migrasyonu
  - `backend/app/models.py` içindeki `Device` sınıfına `esp32_id = Column(Integer, nullable=True)` alanını ekle
  - `backend/app/models.py` içindeki `ESP32Device` sınıfına `device_id`, `pending_config`, `config_json` alanlarını ekle
  - Mevcut hiçbir alanı kaldırma veya adını değiştirme
  - _Gereksinimler: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [ ]* 1.1 Veri modeli smoke testi yaz
    - `devices` tablosunda `esp32_id` kolonunun var olduğunu doğrula
    - `esp32_devices` tablosunda `device_id`, `pending_config`, `config_json` kolonlarının var olduğunu doğrula
    - _Gereksinimler: 1.1, 1.2, 1.3, 1.4_

- [ ] 2. Backend şema ve yardımcı fonksiyon
  - [ ] 2.1 Yeni Pydantic şemalarını `backend/app/schemas.py`'ye ekle
    - `ESP32LinkRequest` (esp32_id: int, device_id: str)
    - `ESP32LinkResponse` (status: str, esp32_id: int, device_id: str)
    - `ESP32HeartbeatRequest`'e `config_ack: Optional[bool] = False` alanını ekle
    - _Gereksinimler: 2.1, 2.7, 3.4_

  - [ ] 2.2 `build_config_payload()` yardımcı fonksiyonunu `backend/app/routes/esp32_routes.py`'ye ekle
    - `Device` nesnesini alır; `device_id`, `device_type`, `subtype`, `modbus_config`, `plc_io_config` alanlarından oluşan dict döndürür
    - _Gereksinimler: 2.4_

  - [ ]* 2.3 `build_config_payload()` için property testi yaz
    - **Özellik 2: Config_Payload Serileştirme Round-Trip**
    - **Doğrular: Gereksinim 2.4**
    - Hypothesis ile rastgele Device alanları üret; `json.loads(json.dumps(build_config_payload(device)))` sonucu orijinal alanlarla eşleşmeli
    - _Gereksinimler: 2.4_

- [ ] 3. `POST /api/esp32/link` endpointini uygula
  - [ ] 3.1 Link endpointini `backend/app/routes/esp32_routes.py`'ye ekle
    - `esp32_id` ve `device_id`'yi doğrula (yoksa 404 döndür)
    - Eski bağlantıyı kaldır: eski Device kaydında `esp32_id = null` yap
    - ESP32Device'da `device_id`, `pending_config = True`, `config_json` güncelle
    - Device'da `esp32_id` güncelle
    - Redis cache'ini geçersiz kıl
    - _Gereksinimler: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [ ]* 3.2 Link endpointi için birim testleri yaz
    - Bilinmeyen `esp32_id` → 404
    - Bilinmeyen `device_id` → 404
    - Başarılı yanıt formatı: `{"status": "linked", "esp32_id": ..., "device_id": ...}`
    - _Gereksinimler: 2.5, 2.6, 2.7_

  - [ ]* 3.3 Link endpointi için property testleri yaz
    - **Özellik 1: Link Sonrası Çift Yönlü Referans ve Bekleyen Durum**
    - **Doğrular: Gereksinim 2.1, 2.2, 2.3**
    - Rastgele geçerli (esp32_id, device_id) çiftleri için link sonrası ESP32Device.device_id, Device.esp32_id ve pending_config=True doğrula
    - **Özellik 3: Yeniden Bağlantı Eski Kaydı Temizler**
    - **Doğrular: Gereksinim 2.8**
    - Rastgele mevcut bağlantılı çiftler için yeniden link → eski Device.esp32_id null
    - _Gereksinimler: 2.1, 2.2, 2.3, 2.8_

- [ ] 4. Kontrol noktası — Temel backend testleri
  - Tüm testlerin geçtiğinden emin ol, sorular varsa kullanıcıya sor.

- [ ] 5. Heartbeat endpoint güncellemesi
  - [ ] 5.1 `POST /api/esp32/heartbeat` yanıtına config iletimini ekle
    - `config_ack == True` ise `pending_config = False` yap (önce işle)
    - `pending_config == True` ise yanıta `config` alanı ekle, ardından `pending_config = False` yap
    - `pending_config == False` ise yanıt yalnızca `status` içerir
    - Mevcut `last_seen`, `ip_address`, `firmware_version` güncellemelerine dokunma
    - _Gereksinimler: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 5.2 Heartbeat güncellemesi için birim testleri yaz
    - Bilinmeyen `esp32_id` → 404
    - `config_ack: true` gönderildiğinde `pending_config = false` olduğunu doğrula
    - _Gereksinimler: 3.4, 3.5_

  - [ ]* 5.3 Heartbeat için property testleri yaz
    - **Özellik 4: Heartbeat Config Sinyal Doğruluğu**
    - **Doğrular: Gereksinim 3.1, 3.2, 3.3**
    - Rastgele ESP32Device durumları (pending_config=True/False) için heartbeat yanıtında config varlığı ve pending_config sonrası durumu doğrula
    - **Özellik 5: Config_ACK Bekleyen Durumu Sıfırlar**
    - **Doğrular: Gereksinim 3.4**
    - Rastgele ESP32Device için `config_ack: true` heartbeat → pending_config=false (pending_config başlangıç değerinden bağımsız)
    - _Gereksinimler: 3.1, 3.2, 3.3, 3.4_

- [ ] 6. `GET /api/esp32/devices` yanıtına `device_id` ekle
  - `esp32_routes.py` içindeki cihaz listesi endpoint'inde her kayda `"device_id": d.device_id` alanını ekle
  - Redis cache key'i aynı tutulur; cache TTL dolduğunda yeni format döner
  - _Gereksinimler: 5.4_

- [ ] 7. `GET /api/devices` yanıtına `esp32_tag` ekle
  - `device_routes.py` içindeki cihaz listesi sorgusuna ESP32Device join'i ekle
  - Her Device kaydına `esp32_tag` alanını ekle: bağlı ESP32 varsa tag adı, yoksa `null`
  - _Gereksinimler: 6.4_

- [ ] 8. Kontrol noktası — Backend entegrasyon akışı
  - Link → Heartbeat → config alımı → pending_config=false tam akışını çalıştır, sorular varsa kullanıcıya sor.

- [ ] 9. Frontend — esp32Store'a `linkDevice` action ekle
  - [ ] 9.1 `src/features/esp32/esp32Store.js`'e `linkDevice(esp32Id, deviceId)` action ekle
    - `POST /api/esp32/link` çağır
    - Başarıda `fetchDevices()` yenile
    - Hata durumunda `error` state'e hata mesajını yaz
    - _Gereksinimler: 4.4_

  - [ ]* 9.2 `esp32Store.linkDevice()` için Vitest testi yaz
    - Başarılı link → devices state yenilendi
    - Başarısız link → error state'te mesaj var
    - _Gereksinimler: 4.4, 4.5_

- [ ] 10. Frontend — Cihaz ekleme formuna ESP32 seçim dropdown ekle
  - [ ] 10.1 `AdminCompanyDetail.jsx`'teki cihaz ekleme modalına ESP32 dropdown ekle
    - `devForm` state'ine `selectedEsp32Id: null` alanını ekle
    - `useEsp32Store().devices`'ı import et; `status === 'connected'` filtrele
    - Cihaz tipi seçildikten sonra dropdown görünür hale gelir
    - Dropdown seçeneği formatı: `"{esp32_tag} — {model}"`
    - Seçim opsiyonel — boş seçenek dahil edilir
    - _Gereksinimler: 4.1, 4.2, 4.3_

  - [ ] 10.2 Cihaz ekleme submit akışına ESP32 link çağrısını entegre et
    - `handleAddDevice()` içinde: `addDevice()` başarılıysa ve `selectedEsp32Id` doluysa `linkDevice()` çağır
    - `linkDevice()` başarısız olursa `devError` state'e hata yaz; cihaz kaydını silme
    - `devForm` reset edilirken `selectedEsp32Id: null` da sıfırla
    - Modal açıldığında `fetchDevices()` çağır (güncel bağlı ESP32 listesi için)
    - _Gereksinimler: 4.4, 4.5, 4.6_

  - [ ]* 10.3 ESP32 dropdown render snapshot testi yaz
    - Bağlı ESP32 varken dropdown görünür
    - Bağlı ESP32 yokken dropdown boş seçenekle görünür
    - _Gereksinimler: 4.1, 4.2_

- [ ] 11. Frontend — AdminESP32Page tablosuna "Bağlı Cihaz" sütunu ekle
  - `src/pages/Admin/ESP32DeviceTable.jsx` dosyasında sütun başlıkları dizisine "Bağlı Cihaz" ekle
  - `device_id` dolu ise: `font-mono text-xs bg-blue-50 text-blue-700` stilinde badge göster
  - `device_id` null ise: "—" göster
  - _Gereksinimler: 5.1, 5.2, 5.3, 5.4_

  - [ ]* 11.1 ESP32DeviceTable snapshot testi yaz
    - `device_id` dolu cihaz → badge render
    - `device_id` null cihaz → "—" render
    - _Gereksinimler: 5.2, 5.3_

- [ ] 12. Frontend — AdminDevices tablosuna "ESP32" sütunu ekle
  - `src/pages/Admin/AdminDevices.jsx` dosyasında tablo başlığına "ESP32" sütunu ekle
  - `esp32_tag` dolu ise: `text-xs text-indigo-600 font-medium` stilinde göster
  - `esp32_tag` null/boş ise: "—" göster
  - _Gereksinimler: 6.1, 6.2, 6.3, 6.4_

  - [ ]* 12.1 AdminDevices ESP32 sütunu snapshot testi yaz
    - `esp32_tag` dolu device → tag adı render
    - `esp32_tag` null device → "—" render
    - _Gereksinimler: 6.2, 6.3_

- [ ] 13. Kontrol noktası — Frontend testleri
  - Tüm testlerin geçtiğinden emin ol, sorular varsa kullanıcıya sor.

- [ ] 14. Firmware — `sendHeartbeat()` config alımı ve ACK güncellemesi
  - [ ] 14.1 `firmware/esp32_scada/esp32_scada.ino`'ya yeni global değişkenleri ve NVS fonksiyonlarını ekle
    - `String g_deviceId = ""` global değişkenini ekle
    - `bool g_sendConfigAck = false` global değişkenini ekle
    - `loadFromNVS()`'e `g_deviceId = prefs.getString("device_id", "")` satırını ekle
    - `saveDeviceIdToNVS(String id)` yardımcı fonksiyonunu yaz
    - _Gereksinimler: 7.2, 7.6_

  - [ ] 14.2 `sendHeartbeat()` fonksiyonunu config parse, NVS yazma ve ACK mekanizmasıyla güncelle
    - İstek body'sine: `g_sendConfigAck` true ise `doc["config_ack"] = true` ekle, ardından `g_sendConfigAck = false` yap
    - HTTP 200 yanıtı parse edildikten sonra: `resp["config"]` null değilse config işle
    - Config işleme: `serializeJsonPretty` ile Serial'e yaz
    - `cfg["device_id"]` boş değilse `saveDeviceIdToNVS()` çağır, log yaz
    - `g_sendConfigAck = true` ata (bir sonraki heartbeat'te ACK gönderir)
    - Mevcut 404 ve hata yönetimine dokunma
    - _Gereksinimler: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [ ] 15. Son kontrol noktası — Tüm testler geçmeli
  - Tüm backend ve frontend testlerinin geçtiğinden emin ol, sorular varsa kullanıcıya sor.

---

## Notlar

- `*` ile işaretli alt görevler opsiyoneldir; daha hızlı MVP için atlanabilir
- Her görev, traceability için belirli gereksinim numaralarına referans verir
- Property testleri minimum 100 iterasyon ile çalıştırılmalıdır (hypothesis `@settings(max_examples=100)`)
- Firmware değişikliği mevcut heartbeat davranışını bozmaz — config alanı yoksa kod dalı çalışmaz
- `esp32_devices` tablosundaki `config_json` alanı config iletildikten sonra **silinmez** — debug ve yeniden gönderim için saklanır
- Soft link, veritabanı düzeyinde kısıt içermediğinden uygulama katmanında tutarlılık sağlanmalıdır

## Görev Bağımlılık Grafiği

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "2.2"] },
    { "id": 1, "tasks": ["2.3", "3.1"] },
    { "id": 2, "tasks": ["3.2", "3.3", "5.1"] },
    { "id": 3, "tasks": ["5.2", "5.3", "6", "7"] },
    { "id": 4, "tasks": ["9.1"] },
    { "id": 5, "tasks": ["9.2", "10.1"] },
    { "id": 6, "tasks": ["10.2", "11", "12"] },
    { "id": 7, "tasks": ["10.3", "11.1", "12.1"] },
    { "id": 8, "tasks": ["14.1"] },
    { "id": 9, "tasks": ["14.2"] }
  ]
}
```
