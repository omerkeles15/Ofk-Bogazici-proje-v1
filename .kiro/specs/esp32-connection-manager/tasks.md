# Uygulama Planı: ESP32 Bağlantı Yönetimi

## Genel Bakış

Bu plan, ESP32 bağlantı yönetimi özelliğini adım adım uygulamaya dökmektedir. Görevler bağımsız katmanlara ayrılmıştır: veritabanı modeli → backend API → frontend store/sayfa → firmware. Her adım bir öncekinin üzerine inşa edilir.

Tasarım ve gereksinimler, görevler uygulanırken bağlam olarak hazır bulunmaktadır.

---

## Görevler

- [ ] 1. Veritabanı Modeli ve Şema Tanımları
  - [ ] 1.1 `ESP32Device` ORM modelini `backend/app/models.py` dosyasına ekle
    - `esp32_devices` tablosunu tasarım belgesindeki sütun tanımlarıyla oluştur
    - `mac_address` sütununa `UNIQUE` kısıtlaması ekle
    - Mevcut modellere dokunma
    - _Gereksinimler: 8.1, 8.2, 8.3_
  - [ ] 1.2 Pydantic şemalarını `backend/app/schemas.py` dosyasına ekle
    - `ESP32RegisterRequest`, `ESP32RegisterResponse`, `ESP32HeartbeatRequest`, `ESP32HeartbeatResponse`, `ESP32DeviceOut` sınıflarını ekle
    - _Gereksinimler: 1.4, 2.4_

- [ ] 2. Backend — ESP32 Route Dosyası
  - [ ] 2.1 `backend/app/routes/esp32_routes.py` dosyasını oluştur
    - `compute_status(last_seen)` yardımcı fonksiyonunu yaz: delta < 10 → "connected", 10–30 → "waiting", ≥ 30 → "offline"
    - `POST /api/esp32/register` endpoint'ini yaz: MAC eşleşmesi varsa mevcut ID döndür, yoksa kayıt oluştur
    - `POST /api/esp32/heartbeat` endpoint'ini yaz: ID doğrula, `last_seen` güncelle, status hesapla
    - `GET /api/esp32/devices` endpoint'ini yaz: Redis cache (TTL=10 sn) destekli cihaz listesi
    - _Gereksinimler: 1.1, 1.2, 1.3, 1.5, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4_
  - [ ]* 2.2 `compute_status()` için özellik testi yaz
    - **Özellik 6: Bağlantı Durumu Eşik Doğruluğu**
    - `hypothesis` kütüphanesi ile `delta_seconds` float değerleri üret, eşik sınırlarını doğrula
    - **Doğrular: Gereksinim 3.2**
    - `Feature: esp32-connection-manager, Property 6: status threshold correctness`
  - [ ]* 2.3 Kayıt idempotency için özellik testi yaz
    - **Özellik 1: Kayıt Idempotency**
    - Rastgele MAC adresleri üret, aynı MAC için iki kayıt → aynı ID olduğunu doğrula
    - **Doğrular: Gereksinim 1.3**
    - `Feature: esp32-connection-manager, Property 1: registration idempotency`
  - [ ]* 2.4 ID benzersizliği için özellik testi yaz
    - **Özellik 2: ID Benzersizliği ve Monotonluğu**
    - N farklı MAC üret, N kayıt ardından ID dizisinin sıralı ve benzersiz olduğunu doğrula
    - **Doğrular: Gereksinim 1.1, 1.2**
    - `Feature: esp32-connection-manager, Property 2: id uniqueness and monotonicity`
  - [ ]* 2.5 Kayıt sonrası `last_seen` varlığı için özellik testi yaz
    - **Özellik 3: Kayıt Sonrası Zaman Damgası Varlığı**
    - Rastgele geçerli kayıt verisi üret, kayıt sonrası `last_seen != null` olduğunu doğrula
    - **Doğrular: Gereksinim 1.5**
    - `Feature: esp32-connection-manager, Property 3: last_seen not null after registration`
  - [ ]* 2.6 Heartbeat sonrası `last_seen` güncellemesi için özellik testi yaz
    - **Özellik 4: Heartbeat Sonrası `last_seen` Güncellemesi**
    - Rastgele kayıtlı cihaz oluştur, heartbeat gönder, `last_seen`'in güncellendiğini doğrula
    - **Doğrular: Gereksinim 2.1**
    - `Feature: esp32-connection-manager, Property 4: heartbeat updates last_seen`
  - [ ]* 2.7 Heartbeat yanıtında status alanı varlığı için özellik testi yaz
    - **Özellik 5: Heartbeat Yanıtında Status Alanı**
    - Geçerli heartbeat istekleri üret, yanıtın status alanını içerdiğini ve geçerli değer olduğunu doğrula
    - **Doğrular: Gereksinim 2.3**
    - `Feature: esp32-connection-manager, Property 5: heartbeat response contains valid status`
  - [ ]* 2.8 Cihaz listesi alan bütünlüğü için özellik testi yaz
    - **Özellik 7: Cihaz Listesi Alan Bütünlüğü**
    - Rastgele `esp32_devices` tablosu durumu oluştur, GET yanıtındaki her kaydın gerekli 8 alanı içerdiğini doğrula
    - **Doğrular: Gereksinim 3.4**
    - `Feature: esp32-connection-manager, Property 7: device list field completeness`

- [ ] 3. Backend — Router Kaydı
  - [ ] 3.1 `esp32_routes.router`'ı `backend/app/main.py` dosyasına ekle
    - `from app.routes import esp32_routes` importunu ve `app.include_router(esp32_routes.router)` satırını ekle
    - Mevcut route kayıtlarına dokunma
    - _Gereksinimler: 1.1, 2.1, 3.1_

- [ ] 4. Kontrol Noktası — Backend Testleri
  - Tüm testlerin geçtiğini doğrula. Sorular varsa kullanıcıya sor.

- [ ] 5. Frontend — ESP32 Zustand Store
  - [ ] 5.1 `src/features/esp32/esp32Store.js` dosyasını oluştur
    - `devices`, `loading`, `error` state alanlarını tanımla
    - `fetchDevices()` action'ını yaz: `GET /api/esp32/devices` çağır, state'i güncelle
    - Hata durumunda `error` state'ini doldur
    - _Gereksinimler: 4.2, 4.6, 4.7_

- [ ] 6. Frontend — Tablo ve Modal Bileşenleri
  - [ ] 6.1 `src/pages/Admin/ESP32DeviceTable.jsx` bileşenini oluştur
    - `devices` prop alır, tasarım belgesindeki sütun sıralamasını kullan
    - `STATUS_CONFIG` ile renk kodlu durum göstergesini uygula (🟢/🟡/🔴)
    - `Son Görülme` sütununda `last_seen` değerini yerelleştirilmiş tarih/saat olarak göster
    - Boş liste durumunda "Henüz kayıtlı cihaz yok" mesajı göster
    - _Gereksinimler: 4.3, 4.4_
  - [ ] 6.2 `src/pages/Admin/ConnectionGuideModal.jsx` bileşenini oluştur
    - Mevcut `Modal.jsx` bileşenini sarmalayıcı olarak kullan
    - AP Mode bağlantı adımlarını numaralı liste olarak göster
    - Register ve Heartbeat API örneklerini biçimlendirilmiş kod blokları içinde göster
    - _Gereksinimler: 5.1, 5.2, 5.3, 5.4_

- [ ] 7. Frontend — Ana Sayfa ve Routing
  - [ ] 7.1 `src/pages/Admin/AdminESP32Page.jsx` sayfasını oluştur
    - `AppLayout` sarmalayıcısını `adminMenu` ile kullan
    - `esp32Store` kullanarak mount'ta `fetchDevices()` çağır ve 10 saniyelik interval kur
    - Yükleniyor durumu için spinner/skeleton göster
    - Hata durumu için hata mesajı + "Yeniden Dene" butonu göster
    - Sağ üstte `?` butonu ile `ConnectionGuideModal` aç/kapat mantığını kur
    - `ESP32DeviceTable` bileşenini `devices` prop ile kullan
    - _Gereksinimler: 4.1, 4.2, 4.5, 4.6, 4.7, 5.1_
  - [ ] 7.2 Admin menüsünü ve route'u kaydet
    - `src/pages/Admin/adminMenu.jsx` dosyasına `{ path: '/admin/esp32', label: 'Bağlı Cihazlar', icon: <Wifi size={18} /> }` ekle
    - `src/App.jsx` dosyasına `/admin/esp32` route'unu `AdminESP32Page` ile ekle, `ProtectedRoute allowedRoles={['admin']}` kullan
    - Mevcut menü öğelerine ve route'lara dokunma
    - _Gereksinimler: 4.1_

- [ ] 8. Kontrol Noktası — Frontend Entegrasyon
  - Tüm testlerin geçtiğini doğrula. Sorular varsa kullanıcıya sor.

- [ ] 9. Firmware — ESP32 Arduino Yazılımı
  - [ ] 9.1 `firmware/esp32_scada/esp32_scada.ino` temel iskeletini oluştur
    - Gerekli kütüphane importlarını ekle: `WiFi.h`, `WebServer.h`, `Preferences.h`, `HTTPClient.h`, `ArduinoJson.h`
    - NVS namespace ve anahtar sabitlerini tanımla
    - `saveToNVS()` ve `loadFromNVS()` yardımcı fonksiyonlarını yaz
    - `setup()` fonksiyonunda NVS okuma ve mod seçim mantığını yaz
    - _Gereksinimler: 7.1, 7.6_
  - [ ] 9.2 AP Mode provisioning akışını uygula
    - `startAPMode()` fonksiyonunu yaz: `ESP32-Setup` AP'si oluştur, HTTP sunucu başlat
    - `handleProvisioningForm()` fonksiyonunu yaz: Wi-Fi listesi taran, HTML form sun
    - Form gönderimini işle: NVS'e kaydet, Wi-Fi bağlantısını dene
    - `connectWifi()` fonksiyonunu yaz: 30 sn zaman aşımı, başarısız olursa AP moduna dön
    - _Gereksinimler: 6.1, 6.2, 6.3, 6.5_
  - [ ] 9.3 Kayıt ve heartbeat fonksiyonlarını uygula
    - `registerDevice()` fonksiyonunu yaz: `POST /api/esp32/register` çağır, yanıttan ID al, NVS'e yaz
    - Başarısız kayıt için 3 deneme + AP moduna dönüş mantığını ekle
    - `sendHeartbeat()` fonksiyonunu yaz: `POST /api/esp32/heartbeat` çağır, 404 alırsa ID sil ve yeniden kayıt başlat
    - `loop()` fonksiyonunda 5 saniyelik heartbeat zamanlayıcısını kur
    - Wi-Fi kopma ve 5 deneme sonrası yeniden başlatma mantığını ekle
    - _Gereksinimler: 6.4, 6.6, 7.2, 7.3, 7.4, 7.5_

- [ ] 10. Son Kontrol Noktası — Tam Sistem Doğrulaması
  - Tüm testlerin geçtiğini doğrula. Sorular varsa kullanıcıya sor.

---

## Notlar

- `*` ile işaretli görevler opsiyoneldir; daha hızlı MVP için atlanabilir
- Her görev, izlenebilirlik için ilgili gereksinimlere referans verir
- Kontrol noktaları artımlı doğrulama sağlar
- Özellik tabanlı testler `hypothesis` kütüphanesi ile yazılır, her test minimum 100 iterasyon çalışır
- Firmware testleri otomatik kapsam dışında tutulur; Manuel Doğrulama adımları design.md'de açıklanmıştır
- Gereksinim 9 (RS485/Modbus) bu plan kapsamı dışındadır

## Görev Bağımlılık Grafiği

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "3.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8"] },
    { "id": 3, "tasks": ["5.1"] },
    { "id": 4, "tasks": ["6.1", "6.2"] },
    { "id": 5, "tasks": ["7.1"] },
    { "id": 6, "tasks": ["7.2"] },
    { "id": 7, "tasks": ["9.1"] },
    { "id": 8, "tasks": ["9.2"] },
    { "id": 9, "tasks": ["9.3"] }
  ]
}
```
