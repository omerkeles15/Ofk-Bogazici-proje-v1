# Uygulama Planı: OFK-SCADA v2

## Genel Bakış

Bu plan, tasarım belgesindeki bileşenleri adım adım kodlama görevlerine dönüştürür. Her görev bir öncekinin üzerine inşa edilir; hiçbir kod parçası asılı veya yetim kalmaz. Görevler Grup 1 (acil bug düzeltmeleri) → Grup 7 (ölçeklenebilirlik) sırasıyla işlenir.

---

## Görevler

### 1. Veri Modeli ve Şema Değişiklikleri

- [ ] 1.1 `Device` modeline `unit_price` alanı ekle
  - `backend/app/models.py` içinde `Device` sınıfına `unit_price = Column(Numeric(10, 2), default=0, nullable=False)` ekle
  - `DeviceCreateSchema` ve `DeviceUpdateSchema`'ya `unit_price: Optional[float] = None` ekle
  - `_device_to_dict` yardımcı fonksiyonuna `"unitPrice"` alanı ekle
  - _Gereksinimler: 13.1, 13.2_

- [ ] 1.2 `ESP32Device` modeline `company_id`, `location_id`, `conflict` alanları ekle
  - `backend/app/models.py` içinde `ESP32Device`'a üç alan ekle: `company_id` (FK, nullable), `location_id` (FK, nullable), `conflict` (Boolean, default False)
  - `ESP32RegisterRequest`'e `company_id: Optional[int] = None` ve `location_id: Optional[int] = None` ekle
  - `esp32_routes.py`'daki `/register` endpoint'ini bu alanları kaydedecek şekilde güncelle
  - _Gereksinimler: 7.5, 7.6, 8.5_

- [ ] 1.3 Veritabanı migrasyon scripti yaz
  - `backend/alembic/versions/` altında yeni migrasyon dosyası oluştur
  - `device.unit_price`, `esp32_device.company_id`, `esp32_device.location_id`, `esp32_device.conflict` sütunlarını ekle
  - `alembic upgrade head` komutu ile doğrulama yap
  - _Gereksinimler: 1.1, 1.2 ile ilgili DB şema_

---

### 2. DiffEngine Modülü

- [ ] 2.1 `backend/app/diff_engine.py` dosyasını oluştur
  - `compute_config_diff(old_config: dict, new_config: dict) -> dict | None` fonksiyonunu yaz
  - `build_full_config_payload(device, company_name, location_name) -> dict` fonksiyonunu yaz
  - `build_diff_config_payload(device, old_plc_io: dict) -> dict | None` fonksiyonunu yaz
  - `apply_diff(base_config: dict, diff_payload: dict) -> dict` fonksiyonunu yaz (round-trip doğrulama için)
  - _Gereksinimler: 11.1, 11.2, 11.3, 16.1, 16.2, 16.3_

- [ ]* 2.2 DiffEngine property testi yaz
  - `backend/tests/test_diff_engine.py` oluştur, `hypothesis` kullan
  - **Property 3: Diff Kapsam Invariantı** — `@given(old=plc_io_strategy(), new=plc_io_strategy())` ile
  - **Doğrular: Gereksinim 11.1, 11.2, 11.3, 16.1, 16.2**
  - Tag: `Feature: scada-v2, Property 3: Diff Kapsam Invariantı`
  - Minimum 100 iterasyon

- [ ]* 2.3 DiffEngine round-trip property testi yaz
  - `backend/tests/test_diff_engine.py`'ye ekle
  - **Property 4: Diff Uygulama Round-Trip** — `@given(config=plc_io_strategy())` ile
  - **Doğrular: Gereksinim 16.4, 16.5**
  - Tag: `Feature: scada-v2, Property 4: Diff Round-Trip`

---

### 3. ESP32 Routes Güncellemeleri

- [ ] 3.1 `esp32_routes.py`'daki `_notify_esp32_if_linked` mantığını DiffEngine ile entegre et
  - `company_routes.py`'daki `_notify_esp32_if_linked` fonksiyonunu güncelle: `build_diff_config_payload` ve `build_full_config_payload` kullanacak şekilde
  - İlk bağlantı (esp32'nin `config_json` boş) → full payload; sonraki → diff payload
  - _Gereksinimler: 10.1, 10.2, 10.3, 11.1_

- [ ] 3.2 `esp32_routes.py` register endpoint'ine `company_id`, `location_id`, `conflict` mantığı ekle
  - Aynı MAC, farklı tag geldiğinde `conflict = True` yap; tag güncellemez
  - `company_id` ve `location_id` varsa ESP32Device'a kaydet
  - _Gereksinimler: 6.2, 6.3, 8.5, 7.5, 7.6_

- [ ] 3.3 ESP32 silme ve tag güncelleme endpoint'leri ekle
  - `DELETE /api/esp32/{id}` — kaydı siler, bağlı `Device.esp32_id`'yi `null` yapar
  - `PATCH /api/esp32/{id}/tag` — `esp32_tag` günceller, bağlı Device varsa full config yeniden gönderir
  - _Gereksinimler: 8.3, 8.4_

- [ ] 3.4 Heartbeat endpoint'ini async kuyruk moduna geçir
  - `/api/esp32/heartbeat` artık `enqueue_heartbeat()` çağırır, 200 OK döndürür
  - Redis bağlantısı yoksa fallback olarak doğrudan DB yazar
  - `config` yanıtı kuyruktaki işlem yerine ayrı bir `GET /api/esp32/{id}/pending-config` endpoint'inden gelir
  - _Gereksinimler: 15.1, 15.4_

---

### 4. Heartbeat Worker

- [ ] 4.1 `backend/app/heartbeat_worker.py` oluştur
  - `enqueue_heartbeat(body: dict) -> None` — Redis `heartbeat_queue` LIST'ine RPUSH
  - `flush_heartbeat_queue(batch_size: int = 200) -> int` — LPOP batch, toplu SQL UPDATE
  - `heartbeat_worker_loop()` — asyncio döngüsü, 1sn aralık
  - _Gereksinimler: 15.1, 15.2, 15.3_

- [ ] 4.2 `heartbeat_worker_loop`'u `backend/app/main.py` startup event'ine ekle
  - `batch_worker_loop` ile birlikte `asyncio.create_task` ile başlat
  - _Gereksinimler: 15.2_

- [ ]* 4.3 Heartbeat worker property testi yaz
  - `backend/tests/test_heartbeat_worker.py` oluştur, `hypothesis` kullan
  - **Property 6: Heartbeat Kuyruk Kaybı Yok** — `@given(n=integers(min_value=1, max_value=500))` ile
  - **Doğrular: Gereksinim 15.1, 15.2, 15.3**
  - Tag: `Feature: scada-v2, Property 6: Heartbeat Kuyruk Kaybı Yok`

---

### 5. Finance Routes

- [ ] 5.1 `backend/app/routes/finance_routes.py` oluştur
  - `GET /api/finance/summary` endpoint'ini yaz
  - Firma → lokasyon → Device ağacını `selectinload` ile çek
  - `status = "online"` olan cihazları filtrele, `unit_price` değerlerini topla
  - Lokasyon alt toplamı, firma toplamı, genel toplam hesapla
  - _Gereksinimler: 14.5, 14.6_

- [ ] 5.2 `finance_routes.py`'yi `backend/app/main.py`'ye kaydet
  - `app.include_router(finance_router)` satırını ekle
  - Admin yetki kontrolü: `require_role("admin")` middleware uygula
  - _Gereksinimler: 14.1_

- [ ]* 5.3 Finans toplam property testi yaz
  - `backend/tests/test_finance_routes.py` oluştur, `hypothesis` kullan
  - **Property 5: Finans Toplam Hesabı Invariantı** — `@given(devices=device_list_strategy())` ile
  - **Doğrular: Gereksinim 14.3, 14.4, 14.5**
  - Tag: `Feature: scada-v2, Property 5: Finans Toplam Hesabı Invariantı`

---

### 6. Checkpoint — Backend Testleri

- [ ] 6.1 Tüm backend testlerinin geçtiğini doğrula
  - `pytest backend/tests/ -v --tb=short` çalıştır
  - DiffEngine, heartbeat worker ve finance route testlerinin tümü yeşil olmalı
  - Tüm testler geçmeli; geçmeyen test varsa düzelt

---

### 7. Firmware Güncellemeleri

- [ ] 7.1 Firmware HTTP redirect ve ngrok header düzeltmelerini uygula
  - `esp32_scada.ino`'daki `registerDevice()` fonksiyonuna `http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS)` ve `http.addHeader("ngrok-skip-browser-warning", "1")` ekle
  - Bu header'lar zaten `sendHeartbeat()`'te mevcut; `registerDevice()`'a da ekle
  - _Gereksinimler: 1.1, 1.2_

- [ ] 7.2 Firmware `saveToNVS()` URL dönüşümünü yeniden yapılandır
  - Mevcut `saveToNVS()` içindeki `http://` → `https://` dönüşüm mantığını doğrula ve `172.16.`–`172.31.` aralığını da yerel IP olarak tanı
  - `FIRMWARE_VERSION` sabitini `"1.4.0"` olarak bırak (zaten güncel)
  - _Gereksinimler: 1.3, 1.4, 2.1_

- [ ] 7.3 Provisioning formuna firma/lokasyon dropdown ekle
  - `fetchCompaniesJson()` C++ fonksiyonu: `GET /api/companies` → JSON string döner
  - `buildProvisioningPage()` fonksiyonunu genişlet: firma dropdown, bağımlı lokasyon dropdown (JavaScript `onchange` ile dinamik)
  - `handleProvisioningForm()`'u `company_id` ve `location_id` alanlarını okuyacak şekilde güncelle
  - `g_esp32Id = 0` resetleme ve kayıt isteğine `company_id`/`location_id` ekle
  - _Gereksinimler: 7.1, 7.2, 7.3, 7.4_

- [ ] 7.4 Firmware diff payload işleme mantığını ekle
  - `sendHeartbeat()` içinde config yanıtında `diff: true` kontrolü yap
  - Diff ise yalnızca `changed` alanlarını uygula; full ise tüm config'i yaz
  - Değişiklik uygulandıktan sonra `g_sendConfigAck = true` yap
  - _Gereksinimler: 16.4, 16.5_

---

### 8. Checkpoint — Firmware Derleme

- [ ] 8.1 Firmware değişikliklerini Arduino IDE veya PlatformIO ile derleme doğrulaması
  - `esp32_scada.ino` sıfır hatayla derlenmeli
  - Derleme başarısızsa hataları düzelt, tekrar dene

---

### 9. Frontend — companyStore ve esp32Store Genişletmesi

- [ ] 9.1 `companyStore.js`'e `updateDevice` action'ının senkronizasyon iyileştirmesi
  - `updateDevice` action'ı store içindeki ilgili device'ı bulup güncellediğini doğrula (mevcut mantık)
  - `unit_price` alanını form ve store'a ekle
  - _Gereksinimler: 3.3, 3.4, 13.3_

- [ ] 9.2 `esp32Store.js`'e `deleteEsp32` ve `updateEsp32Tag` action'ları ekle
  - `deleteEsp32(id)`: `DELETE /api/esp32/:id` → başarıda store'dan kaldır
  - `updateEsp32Tag(id, tag)`: `PATCH /api/esp32/:id/tag` → başarıda store güncelle
  - _Gereksinimler: 8.3, 8.4_

- [ ]* 9.3 Store idempotence property testi yaz (Vitest)
  - `src/__tests__/companyStore.test.js` oluştur
  - **Property 2: Store Senkronizasyonu — İzdeşlik** — aynı payload ile iki kez çağrı, state değişmemeli
  - **Doğrular: Gereksinim 3.4, 4.3, 4.4**
  - Tag: `Feature: scada-v2, Property 2: Store Senkronizasyonu İzdeşlik`

---

### 10. Frontend — Ortak Bileşenler

- [ ] 10.1 `DeviceEditModal` ortak bileşenini oluştur
  - `src/components/DeviceEditModal.jsx` — `AdminCompanyDetail.jsx`'teki mevcut cihaz düzenleme formunu buraya taşı
  - Props: `device`, `locationId`, `companyId`, `onSave`, `onClose`
  - `unit_price` alanını forma ekle
  - `esp32Store` kullanımını dahil et (bağlı ESP32 seçimi)
  - _Gereksinimler: 3.2, 9.1, 9.3, 13.3_

- [ ] 10.2 `InlineEditCell` bileşenini oluştur
  - `src/components/InlineEditCell.jsx` — tıkla → input → blur/enter → save akışı
  - Props: `value`, `editable`, `onSave`, `type` (text | number)
  - Kaydetme sırasında yükleniyor göstergesi
  - _Gereksinimler: 5.2, 5.3, 5.4_

---

### 11. Frontend — AdminDevices Sayfası Güncellemesi

- [ ] 11.1 `AdminDevices.jsx`'e "Düzenle" butonu ve `DeviceEditModal` entegrasyonu ekle
  - Her tablo satırına `<Pencil>` butonlu "Düzenle" butonu ekle
  - Butona tıklayınca seçili device ile `DeviceEditModal` aç
  - Modal kaydettiğinde `companyStore.updateDevice` çağır ve listeyi yenile
  - `unit_price` bilgisini tablo sütununa ekle
  - _Gereksinimler: 3.1, 3.2, 3.3, 13.4_

---

### 12. Frontend — İzleme Sayfası Satır İçi Düzenleme

- [ ] 12.1 İzleme sayfasından "I/O Yapılandırmasını Düzenle" butonunu kaldır
  - İlgili izleme sayfası bileşenini bul (`AdminDeviceHistory.jsx` veya ilgili monitoring component)
  - Butonu kaldır; `InlineEditCell` bileşenleriyle tag ismi hücrelerini sar
  - Kayıt butonunun adını "Değişiklikleri Kaydet" olarak güncelle
  - _Gereksinimler: 5.1, 5.6_

- [ ] 12.2 Rol bazlı satır içi düzenleme kısıtını uygula
  - Mevcut kullanıcı rolüne göre (`admin` vs diğer) düzenlenebilir alanları belirle
  - `admin` ise: tag ismi + coil adresi + PLC tag → hepsi `editable=true`
  - Diğer roller: yalnızca tag ismi `editable=true`; coil ve PLC tag `editable=false`
  - _Gereksinimler: 5.3, 5.4_

- [ ] 12.3 "Değişiklikleri Kaydet" butonuna diff kaydetme mantığını bağla
  - Sayfa açılışında I/O config anlık görüntüsünü al
  - Kaydet butonuna tıklanınca `companyStore.updateDevice` çağır
  - _Gereksinimler: 5.5_

---

### 13. Frontend — Bağlı Cihazlar Sayfası Güncellemeleri

- [ ] 13.1 `ESP32DeviceTable.jsx`'e yeni sütunlar ve satır içi tag düzenleme ekle
  - "Firma" ve "Lokasyon" sütunları ekle (ESP32Device'daki `company_id`/`location_id` üzerinden)
  - Tag ismi hücresini `InlineEditCell` ile sar; `esp32Store.updateEsp32Tag` action'ına bağla
  - `conflict: true` olan satırlara ⚠️ simgesi ekle
  - Admin rolünde "Sil" butonu ekle; `esp32Store.deleteEsp32` çağırsın
  - _Gereksinimler: 8.1, 8.2, 8.3, 8.4, 8.6_

- [ ] 13.2 Cihaz formundaki ESP32 dropdown'ını "kullanımda" mantığıyla güncelle
  - `DeviceEditModal.jsx` içinde ESP32 dropdown render mantığını güncelle
  - `device_id` dolu ve bu ID düzenlenen cihazın ID'si değilse → `disabled` + `"(kullanımda)"` etiketi
  - _Gereksinimler: 8.7, 9.1, 9.2, 9.3_

---

### 14. Frontend — Pasif Cihaz Bildirimi

- [ ] 14.1 WebSocket bildirim bağlantısı oluştur
  - `src/hooks/useNotifications.js` hook'u oluştur
  - Backend `ws_manager.py` üzerinden `/ws/notifications` bağlantısı kur
  - Gelen `device_passive` mesajlarını dinle; firma ID filtrelemesi yap
  - _Gereksinimler: 12.2, 12.3_

- [ ] 14.2 Firma kullanıcıları için pasif uyarı banner'ı ekle
  - Kullanıcı ana sayfasına (Company/User dashboard) `useNotifications` hook'unu bağla
  - Pasif cihaz bildirimi gelince sarı uyarı banner'ı göster: "Bu cihaz admin tarafından pasife alınmıştır."
  - Cihaz tekrar aktife alındığında banner'ı gizle
  - _Gereksinimler: 12.3, 12.4_

- [ ] 14.3 Backend'de pasif cihaz bildirim yayınını ekle
  - `company_routes.py`'daki `toggle_device` endpoint'ini güncelle: cihaz `offline` yapılınca `ws_manager` veya Redis pub/sub üzerinden `{"event": "device_passive", "device_id": ..., "company_id": ...}` yayınla
  - _Gereksinimler: 12.1, 12.2_

---

### 15. Frontend — Finans Paneli

- [ ] 15.1 `FinancePage.jsx` bileşenini oluştur
  - `src/pages/Admin/FinancePage.jsx` — `GET /api/finance/summary` endpoint'ini çağır
  - Firma bazlı gruplandırılmış tablo: lokasyon ara toplamları dahil
  - Aktif/pasif cihaz ayrımını renkle göster
  - Genel toplam satırı
  - _Gereksinimler: 14.2, 14.3, 14.4, 14.5_

- [ ] 15.2 Admin menüsüne "💰 Hesap Yönetimi" bağlantısı ekle
  - `src/pages/Admin/adminMenu.jsx` dosyasına yeni menü öğesi ekle
  - Route tanımını `App.jsx`'e ekle: `/admin/finance` → `<FinancePage />`
  - Yalnızca `admin` rolünde göster
  - _Gereksinimler: 14.1_

---

### 16. Checkpoint — Uçtan Uca Doğrulama

- [ ] 16.1 Tüm testlerin geçtiğini ve entegrasyon akışlarının çalıştığını doğrula
  - `pytest backend/tests/ -v` → tüm yeşil
  - `vitest --run` → tüm yeşil
  - Manuel akış testi: Cihaz ekle → ESP32 seç → heartbeat → config alındı → diff güncelleme → finans sayfası
  - Tüm testler geçmeli; geçmeyen varsa düzelt, kullanıcıya sor

---

## Notlar

- `*` ile işaretli alt görevler opsiyoneldir; MVP için atlanabilir
- Her görev referans verdiği gereksinim numaraları üzerinden izlenebilir
- Backend testleri: `hypothesis` kütüphanesi, frontend testleri: `vitest` kullanır
- Property testleri minimum 100 iterasyon ile çalıştırılmalıdır
- Checkpoint görevleri geçilmeden sonraki gruba geçilmemelidir

---

## Görev Bağımlılık Grafiği

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "2.1", "7.1", "7.2"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.1", "3.2", "4.1", "7.3", "7.4"] },
    { "id": 3, "tasks": ["3.3", "3.4", "4.2", "4.3", "5.1", "8.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "6.1", "9.1", "9.2"] },
    { "id": 5, "tasks": ["9.3", "10.1", "10.2"] },
    { "id": 6, "tasks": ["11.1", "12.1", "13.1", "14.3", "15.1"] },
    { "id": 7, "tasks": ["12.2", "12.3", "13.2", "14.1", "15.2"] },
    { "id": 8, "tasks": ["14.2"] },
    { "id": 9, "tasks": ["16.1"] }
  ]
}
```
