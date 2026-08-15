# Gereksinimler Belgesi — ESP32 ↔ Cihaz Eşleştirme ve Yapılandırma Gönderimi

## Giriş

Bu belge, OFK-SCADA sistemindeki `ESP32Device` tablosu ile `Device` tablosu arasında çift yönlü bir yazılım bağlantısı kurulmasını ve ardından ESP32 donanımına ilgili cihaz yapılandırmasının (Modbus/PLC I/O) heartbeat mekanizması üzerinden iletilmesini tanımlar.

Özellik üç ana sorumluluk alanını kapsar:

1. **Veri katmanı** — `Device.esp32_id` ve `ESP32Device.device_id` alanları ile iki tablonun karşılıklı referanslanması; `ESP32Device.pending_config` ve `ESP32Device.config_json` ile yapılandırma iletim durumunun izlenmesi.
2. **Backend katmanı** — Bağlantı kuran yeni bir endpoint (`POST /api/esp32/link`) ve mevcut heartbeat yanıtının yapılandırma taşıyacak şekilde genişletilmesi.
3. **Frontend katmanı** — Cihaz ekleme formuna "Bağlı ESP32 Seç" adımı, "Bağlı Cihazlar" tablosuna yeni sütun, cihaz listesine ESP32 tag bilgisi eklenmesi.
4. **Firmware katmanı** — Heartbeat yanıtındaki `config` alanının ayrıştırılarak NVS'e yazılması ve bir sonraki heartbeat'te alındı bilgisinin iletilmesi.

Mevcut `Company`, `Location`, `Device`, `User`, `ESP32Device` modelleri ve mevcut route'lar değiştirilmeden, yalnızca yeni alanlar ve endpointler eklenir; bağlantı bir yabancı anahtar kısıtı (FK) değil, yazılım düzeyinde (soft link) bir referanstır.

---

## Sözlük

- **Device**: `devices` tablosundaki, `DEV-001` formatında birincil anahtara sahip, firmaya ve lokasyona bağlı endüstriyel cihaz kaydı. `modbus_config` ve `plc_io_config` JSON alanları içerir.
- **ESP32Device**: `esp32_devices` tablosundaki, tamsayı birincil anahtara sahip, MAC adresiyle tanımlanan ESP32 donanım kaydı.
- **Soft Link**: Veritabanı kısıtı olmaksızın, sadece sütun değerleriyle kurulan çift yönlü referans (`Device.esp32_id` ↔ `ESP32Device.device_id`).
- **Config_Payload**: Bir Device kaydının `device_id`, `device_type`, `subtype`, `modbus_config`, `plc_io_config` alanlarından oluşturulan, ESP32'ye iletilecek JSON nesnesi.
- **Link_API**: `POST /api/esp32/link` endpointi — iki kaydı birbirine bağlar ve `pending_config = true` atar.
- **Heartbeat_API**: `POST /api/esp32/heartbeat` endpointi — ESP32'nin her 5 saniyede bir çağırdığı, `last_seen` güncelleyen ve varsa Config_Payload taşıyan endpoint.
- **Pending_Config**: `ESP32Device.pending_config` Boolean alanı; `true` ise bir sonraki heartbeat yanıtına Config_Payload eklenir.
- **NVS**: ESP32 donanımının kalıcı anahtar-değer deposu (Non-Volatile Storage, `Preferences.h` kütüphanesi).
- **Config_ACK**: Firmware'in config'i başarıyla aldığını bildirmek için heartbeat isteğine eklediği `config_ack: true` alanı.
- **AdminESP32Page**: `/admin/esp32` yolundaki React sayfası — ESP32 cihaz listesini gösterir.
- **AdminDevices**: `/admin/devices` yolundaki React sayfası — tüm Device kayıtlarını listeler.
- **AdminCompanyDetail**: `/admin/companies/:id` yolundaki React sayfası — firmaya ait lokasyon ve cihaz yönetimini içerir.

---

## Gereksinimler

### Gereksinim 1: Veri Modeli Genişletmesi

**Kullanıcı Hikayesi:** Bir sistem mimarı olarak, ESP32 cihazları ile SCADA cihazlarının veri tabanında karşılıklı referanslanmasını istiyorum; böylece hangi ESP32'nin hangi Device'ı yönettiğini sorgulayabileyim.

#### Kabul Kriterleri

1. THE Device_Model SHALL `esp32_id` adında nullable Integer kolonu içermelidir.
2. THE ESP32Device_Model SHALL `device_id` adında nullable String(20) kolonu içermelidir.
3. THE ESP32Device_Model SHALL `pending_config` adında Boolean kolonu içermeli ve varsayılan değeri `false` olmalıdır.
4. THE ESP32Device_Model SHALL `config_json` adında nullable Text kolonu içermelidir.
5. WHEN bir ESP32Device kaydı oluşturulduğunda, THE ESP32Device_Model SHALL `pending_config` alanını `false` olarak başlatmalıdır.
6. THE Device_Model SHALL mevcut hiçbir kolonu kaldırmadan veya adını değiştirmeden yeni `esp32_id` kolonu eklenmelidir.

---

### Gereksinim 2: Bağlantı API'si (Link Endpoint)

**Kullanıcı Hikayesi:** Bir admin kullanıcı olarak, bir ESP32 donanımını belirli bir SCADA cihazıyla eşleştirmek istiyorum; böylece ESP32, o cihazın yapılandırmasını otomatik olarak alabilsin.

#### Kabul Kriterleri

1. WHEN `POST /api/esp32/link` isteği `esp32_id` ve `device_id` içerdiğinde, THE Link_API SHALL `ESP32Device.device_id` alanını verilen `device_id` ile güncellelidir.
2. WHEN `POST /api/esp32/link` isteği işlendiğinde, THE Link_API SHALL `Device.esp32_id` alanını verilen `esp32_id` ile güncellelidir.
3. WHEN `POST /api/esp32/link` isteği işlendiğinde, THE Link_API SHALL `ESP32Device.pending_config` alanını `true` olarak atamalıdır.
4. WHEN `POST /api/esp32/link` isteği işlendiğinde, THE Link_API SHALL Device kaydından `device_id`, `device_type`, `subtype`, `modbus_config`, `plc_io_config` alanlarından Config_Payload oluşturarak `ESP32Device.config_json` alanına JSON string olarak kaydetmelidir.
5. IF verilen `esp32_id` `esp32_devices` tablosunda bulunmuyorsa, THEN THE Link_API SHALL 404 HTTP durum kodu döndürmelidir.
6. IF verilen `device_id` `devices` tablosunda bulunmuyorsa, THEN THE Link_API SHALL 404 HTTP durum kodu döndürmelidir.
7. WHEN bağlantı başarıyla kurulduğunda, THE Link_API SHALL `{"status": "linked", "esp32_id": <int>, "device_id": "<str>"}` içeren 200 yanıtı döndürmelidir.
8. IF bir ESP32 zaten farklı bir Device'a bağlıysa, THEN THE Link_API SHALL eski bağlantıyı kaldırarak yeni bağlantıyı kurmalıdır (eski Device kaydında `esp32_id` null yapılmalı).

---

### Gereksinim 3: Heartbeat Yapılandırma İletimi

**Kullanıcı Hikayesi:** Bir ESP32 donanımı olarak, her heartbeat yanıtında bekleyen bir yapılandırma olup olmadığını öğrenmek istiyorum; böylece sunucudan gelen Modbus/PLC ayarlarını otomatik olarak uygulayabileyim.

#### Kabul Kriterleri

1. WHEN `POST /api/esp32/heartbeat` isteği geldiğinde ve ilgili ESP32Device kaydının `pending_config` alanı `true` ise, THE Heartbeat_API SHALL yanıta `config` alanı olarak Config_Payload JSON nesnesini eklelidir.
2. WHEN heartbeat yanıtında `config` alanı gönderildikten sonra, THE Heartbeat_API SHALL `ESP32Device.pending_config` alanını `false` olarak güncellemelidir.
3. WHEN `POST /api/esp32/heartbeat` isteği geldiğinde ve `pending_config` alanı `false` ise, THE Heartbeat_API SHALL yanıta `config` alanı eklememelidir (yanıt sadece `status` içermelidir).
4. WHEN heartbeat isteği `config_ack: true` alanı içerdiğinde, THE Heartbeat_API SHALL `ESP32Device.pending_config` alanını `false` yapmalı ve bu durumu kayıt altına almalıdır.
5. IF heartbeat isteğindeki `esp32_id` `esp32_devices` tablosunda bulunmuyorsa, THEN THE Heartbeat_API SHALL 404 HTTP durum kodu döndürmelidir.

---

### Gereksinim 4: Cihaz Ekleme Formuna ESP32 Seçimi

**Kullanıcı Hikayesi:** Bir admin kullanıcı olarak, yeni bir cihaz eklerken hangi ESP32 donanımının bu cihaza hizmet edeceğini seçmek istiyorum; böylece cihaz oluşturulduktan hemen sonra yapılandırma ESP32'ye otomatik gönderilsin.

#### Kabul Kriterleri

1. WHEN cihaz ekleme formunda cihaz tipi seçildiğinde, THE AdminCompanyDetail SHALL "Bağlı ESP32 Seç" başlıklı bir dropdown göstermelidir.
2. THE AdminCompanyDetail SHALL dropdown içinde yalnızca `status = "connected"` olan ESP32 cihazlarını listelemelidir (tag ismi + model formatında).
3. WHERE kullanıcı dropdown'dan ESP32 seçmezse, THE AdminCompanyDetail SHALL cihazı ESP32 bağlantısı olmadan kaydetmelidir.
4. WHEN kullanıcı dropdown'dan bir ESP32 seçip formu kaydettiğinde, THE AdminCompanyDetail SHALL `POST /api/esp32/link` endpointini yeni oluşturulan `device_id` ve seçilen `esp32_id` ile çağırmalıdır.
5. IF `POST /api/esp32/link` isteği başarısız olursa, THEN THE AdminCompanyDetail SHALL hata mesajını form altında göstermelidir, ancak cihaz kaydı silinmemelidir.
6. WHEN cihaz ekleme formu açıldığında, THE AdminCompanyDetail SHALL mevcut bağlı ESP32 listesini `/api/esp32/devices` API'sinden çekmelidir.

---

### Gereksinim 5: Bağlı Cihazlar Tablosu Güncellemesi

**Kullanıcı Hikayesi:** Bir admin kullanıcı olarak, "Bağlı Cihazlar" sayfasında her ESP32'nin hangi Device'a bağlı olduğunu görmek istiyorum; böylece eşleştirme durumunu tek bakışta anlayabileyim.

#### Kabul Kriterleri

1. THE AdminESP32Page SHALL mevcut tabloya "Bağlı Cihaz" başlıklı yeni bir sütun eklenmelidir.
2. WHEN bir ESP32Device kaydının `device_id` alanı dolu ise, THE AdminESP32Page SHALL ilgili hücrede `device_id` değerini (örn. "DEV-001") göstermelidir.
3. WHEN bir ESP32Device kaydının `device_id` alanı null ise, THE AdminESP32Page SHALL ilgili hücrede "—" göstermelidir.
4. THE AdminESP32Page SHALL `GET /api/esp32/devices` yanıtının her kaydında `device_id` alanını içermesini beklemelidir.

---

### Gereksinim 6: Cihaz Listesinde ESP32 Bilgisi

**Kullanıcı Hikayesi:** Bir admin kullanıcı olarak, cihaz listesinde hangi Device'ın hangi ESP32 tarafından yönetildiğini görmek istiyorum; böylece donanım-yazılım eşleştirmesini doğrulayabileyim.

#### Kabul Kriterleri

1. THE AdminDevices SHALL mevcut tabloya "ESP32" başlıklı yeni bir sütun eklenmelidir.
2. WHEN bir Device kaydının `esp32_id` alanı dolu ise, THE AdminDevices SHALL ilgili hücrede ESP32'nin `esp32_tag` değerini göstermelidir.
3. WHEN bir Device kaydının `esp32_id` alanı null ise, THE AdminDevices SHALL ilgili hücrede "—" göstermelidir.
4. THE AdminDevices SHALL `GET /api/devices` yanıtının her kaydında `esp32_tag` alanını içermesini beklemelidir; bu alan eşleşme varsa ESP32 tag adı, yoksa null veya boş string olmalıdır.

---

### Gereksinim 7: Firmware Yapılandırma Alımı

**Kullanıcı Hikayesi:** Bir ESP32 donanımı olarak, heartbeat yanıtında config alanı gördüğümde bu yapılandırmayı işleyip NVS'e kaydetmek istiyorum; böylece enerji kesilmesi durumunda da yapılandırma korunmuş olsun.

#### Kabul Kriterleri

1. WHEN heartbeat yanıtı `config` alanı içerdiğinde, THE Firmware SHALL `config` nesnesini Serial çıkışına yazmalıdır.
2. WHEN heartbeat yanıtı `config` alanı içerdiğinde, THE Firmware SHALL `config.device_id` değerini NVS'de `device_id` anahtarına kaydetmelidir.
3. WHEN heartbeat yanıtı `config` alanı içerdiğinde, THE Firmware SHALL bir sonraki heartbeat isteğine `config_ack: true` alanını ekleyerek sunucuya alındı bildirmelidir.
4. WHEN heartbeat yanıtı `config` alanı içermediğinde, THE Firmware SHALL mevcut davranışını değiştirmemelidir (sadece `status` alanını okur).
5. THE Firmware SHALL `config_ack` alanını, config alındıktan sonraki yalnızca bir heartbeat isteğine eklemeli; sonraki isteklerde eklememelidir.
6. WHEN NVS'e `device_id` yazıldıktan sonra, THE Firmware SHALL Serial çıkışına "[Config] device_id=<deger> NVS'e kaydedildi." formatında log yazmalıdır.
