# Gereksinimler Belgesi — ESP32 Bağlantı Yönetimi

## Giriş

Bu özellik, mevcut OFK-SCADA web uygulamasına **ESP32 tabanlı IoT cihazların** yönetimini ekler. Sistem; yeni bir backend API katmanı, bağımsız bir veritabanı tablosu ve özel bir yönetim arayüzünden oluşur. Mevcut firma/lokasyon/cihaz/kullanıcı yapısına dokunulmaz; ESP32 yönetimi tamamen ayrı bir katman olarak eklenir.

Özelliğin kapsamı:
- ESP32'nin ilk açılışta AP moduna girerek Wi-Fi ve sunucu bilgilerini alması (provisioning)
- Sunucuya kayıt olarak kalıcı bir ID edinmesi
- Düzenli heartbeat göndererek bağlantı durumunu bildirmesi
- Web arayüzünden tüm ESP32 cihazlarının anlık durum izlenmesi
- Geliştirici/kurulum rehberinin modal olarak sunulması
- Arduino/C++ tabanlı ESP32 firmware'inin sıfırdan yazılması

---

## Sözlük

- **ESP32_Device**: Sisteme kaydedilen bir ESP32 mikrodenetleyici birimi. Mevcut `Device` modelinden bağımsızdır.
- **ESP32_Server**: Mevcut OFK-SCADA FastAPI backend sunucusu; ESP32 isteklerini işleyen yeni endpointleri barındırır.
- **Provisioning**: ESP32'nin ilk açılışta Wi-Fi kimlik bilgilerini ve sunucu URL'ini alması süreci.
- **AP_Mode**: ESP32'nin bir erişim noktası (Access Point) olarak davrandığı, kullanıcının doğrudan bağlandığı ağ modu.
- **Heartbeat**: ESP32'nin periyodik olarak sunucuya gönderdiği canlılık sinyali.
- **NVS**: ESP32'nin Non-Volatile Storage (kalıcı bellek) katmanı; enerji kesilse de veriler korunur.
- **ESP32_ID**: Sunucu tarafından atanan ve asla tekrar kullanılmayan kalıcı tam sayı kimliği.
- **Connection_Status**: ESP32'nin son heartbeat zamanına göre hesaplanan durumu: `connected` (< 10 sn), `waiting` (10–30 sn), `offline` (> 30 sn).
- **Provisioning_UI**: ESP32 AP moduna bağlıyken erişilen, Wi-Fi ve sunucu bilgilerini toplayan yerel web arayüzü.
- **Admin_ESP32_Page**: OFK-SCADA admin panelindeki "Bağlı Cihazlar" yönetim sayfası.
- **Connection_Guide_Modal**: ESP32 kurulum adımlarını ve API formatını gösteren yardım modal'ı.

---

## Gereksinimler

### Gereksinim 1: ESP32 Kayıt (Register) API

**Kullanıcı Hikâyesi:** Bir ESP32 cihaz geliştiricisi olarak, cihazımı sunucuya kaydetmek istiyorum ki sisteme dahil olabileyim ve kalıcı bir kimlik edineyim.

#### Kabul Kriterleri

1. WHEN bir ESP32 cihazı `POST /api/esp32/register` isteği gönderdiğinde, THE ESP32_Server SHALL bu cihazı `esp32_devices` tablosuna kaydedip benzersiz bir `ESP32_ID` döndürür.
2. THE ESP32_Server SHALL atanan `ESP32_ID` değerini sıfırdan başlayarak otomatik artan tam sayı olarak üretir ve bu değeri asla tekrar kullanmaz.
3. WHEN aynı MAC adresiyle ikinci bir kayıt isteği geldiğinde, THE ESP32_Server SHALL yeni kayıt oluşturmak yerine mevcut kaydın `ESP32_ID`'sini döndürür.
4. WHEN kayıt isteği `esp32_tag`, `device_type`, `model` veya `mac_address` alanlarından herhangi birini içermediğinde, THE ESP32_Server SHALL `422 Unprocessable Entity` hata kodu ile yanıt verir.
5. THE ESP32_Server SHALL kayıt anında `last_seen` alanını geçerli UTC zaman damgasıyla doldurur.

---

### Gereksinim 2: Heartbeat API

**Kullanıcı Hikâyesi:** Bir ESP32 cihaz geliştiricisi olarak, cihazımın düzenli olarak sunucuya ping göndermesini istiyorum ki bağlantı durumu doğru izlenebilsin.

#### Kabul Kriterleri

1. WHEN bir ESP32 cihazı `POST /api/esp32/heartbeat` isteğini geçerli `esp32_id` ile gönderdiğinde, THE ESP32_Server SHALL ilgili kaydın `last_seen` alanını geçerli UTC zaman damgasıyla günceller ve `200 OK` yanıtı verir.
2. WHEN heartbeat isteği bilinmeyen bir `esp32_id` içerdiğinde, THE ESP32_Server SHALL `404 Not Found` hata kodu ile yanıt verir.
3. THE ESP32_Server SHALL heartbeat yanıtına cihazın güncel `status` değerini ekler.
4. WHILE bir ESP32 cihazı en fazla 5 saniyelik aralıklarla heartbeat gönderirken, THE ESP32_Server SHALL her isteği ayrı olarak işler; istek başına 1 MB'den küçük yükler için 200 ms'den kısa sürede yanıt verir.

---

### Gereksinim 3: Cihaz Listesi API

**Kullanıcı Hikâyesi:** Bir sistem yöneticisi olarak, kayıtlı tüm ESP32 cihazlarını ve anlık durumlarını görmek istiyorum.

#### Kabul Kriterleri

1. WHEN yönetici `GET /api/esp32/devices` isteği gönderdiğinde, THE ESP32_Server SHALL `esp32_devices` tablosundaki tüm kayıtları JSON dizisi olarak döndürür.
2. THE ESP32_Server SHALL her cihaz kaydına `Connection_Status` alanını hesaplayarak ekler: `last_seen` değeri 10 sn'den eskiyse `connected`, 10–30 sn arasındaysa `waiting`, 30 sn'den eskiyse `offline` olarak ayarlanır.
3. WHEN `GET /api/esp32/devices` isteği gönderildiğinde, THE ESP32_Server SHALL yanıtı en fazla 10 saniye önce hesaplanmış Redis cache'inden döndürür; cache geçersizse veritabanından taze veri çekerek cache'i yeniler.
4. THE ESP32_Server SHALL cihaz listesi yanıtında her kayıt için `id`, `esp32_tag`, `device_type`, `model`, `ip_address`, `status`, `last_seen`, `created_at` alanlarını içerir.

---

### Gereksinim 4: Bağlı Cihazlar Yönetim Sayfası

**Kullanıcı Hikâyesi:** Bir sistem yöneticisi olarak, tüm ESP32 cihazlarını tek bir sayfadan izlemek ve yönetmek istiyorum.

#### Kabul Kriterleri

1. THE Admin_ESP32_Page SHALL admin sol menüsünde "Bağlı Cihazlar" başlığıyla mevcut menü öğelerinin altında yer alır; mevcut menü öğeleri kaldırılmaz veya yeri değiştirilmez.
2. WHEN Admin_ESP32_Page yüklendiğinde, THE Admin_ESP32_Page SHALL `GET /api/esp32/devices` endpoint'ini çağırarak cihaz listesini tabloya doldurur.
3. THE Admin_ESP32_Page SHALL tablo sütunlarını şu sırayla gösterir: ID, ESP32 Tag, Cihaz Türü, Model, IP Adresi, Durum, Son Görülme.
4. THE Admin_ESP32_Page SHALL `Connection_Status` değerine göre Durum sütununda renk kodlu gösterge sunar: `connected` için yeşil ikon, `waiting` için sarı ikon, `offline` için kırmızı ikon.
5. WHEN Admin_ESP32_Page görüntülenirken, THE Admin_ESP32_Page SHALL cihaz listesini 10 saniyede bir otomatik olarak yeniler.
6. WHERE sayfa yüklenirken veri henüz gelmemişse, THE Admin_ESP32_Page SHALL yükleniyor göstergesi (skeleton veya spinner) gösterir.
7. IF `GET /api/esp32/devices` isteği başarısız olursa, THE Admin_ESP32_Page SHALL kullanıcıya hata mesajı gösterir ve yeniden deneme butonu sunar.

---

### Gereksinim 5: ESP32 Bağlantı Rehberi Modal

**Kullanıcı Hikâyesi:** Bir sistem yöneticisi veya cihaz geliştiricisi olarak, ESP32 cihazını sisteme nasıl bağlayacağımı adım adım görmek istiyorum.

#### Kabul Kriterleri

1. THE Admin_ESP32_Page SHALL sağ üst köşesinde `?` ikonuna sahip bir buton içerir.
2. WHEN kullanıcı `?` butonuna tıkladığında, THE Connection_Guide_Modal SHALL ekranda belirir ve şu bölümleri içerir: (a) AP Mode bağlantı adımları, (b) Register API istek/yanıt formatı, (c) Heartbeat API istek/yanıt formatı.
3. WHEN kullanıcı modal dışına tıkladığında veya kapat butonuna bastığında, THE Connection_Guide_Modal SHALL kapanır.
4. THE Connection_Guide_Modal SHALL API örneklerini biçimlendirilmiş kod blokları içinde gösterir.

---

### Gereksinim 6: ESP32 AP Mode Provisioning Firmware

**Kullanıcı Hikâyesi:** Bir cihaz geliştiricisi olarak, ESP32'nin ilk açılışta kolayca ağa bağlanmasını ve sunucuya kaydolmasını istiyorum.

#### Kabul Kriterleri

1. WHEN ESP32 ilk kez açıldığında veya NVS'de Wi-Fi bilgisi bulunamadığında, THE ESP32_Device SHALL AP moduna geçer ve `ESP32-Setup` adında bir erişim noktası oluşturur.
2. WHILE ESP32 AP modundayken, THE ESP32_Device SHALL yerel IP adresinde (192.168.4.1) bir HTTP sunucu çalıştırır ve kullanıcıya Wi-Fi ağlarını listeleyen bir HTML form sunar.
3. WHEN kullanıcı Provisioning_UI üzerinden Wi-Fi ağı, şifre, sunucu URL, ESP32 Tag ve cihaz açıklaması bilgilerini gönderdiğinde, THE ESP32_Device SHALL bu bilgileri NVS'e kaydeder ve Wi-Fi ağına bağlanmaya çalışır.
4. WHEN ESP32 seçilen Wi-Fi ağına başarıyla bağlandığında, THE ESP32_Device SHALL `POST /api/esp32/register` isteğini sunucuya gönderir ve dönen `ESP32_ID`'yi NVS'e kaydeder.
5. IF Wi-Fi bağlantısı 30 saniye içinde kurulamazsa, THE ESP32_Device SHALL AP moduna geri döner ve yerel arayüzde hata mesajı gösterir.
6. IF sunucu kayıt isteği başarısız olursa, THE ESP32_Device SHALL 60 saniye bekleyip yeniden deneme yapar; 3 başarısız denemeden sonra AP moduna döner.

---

### Gereksinim 7: ESP32 Kalıcı ID ve Heartbeat Firmware

**Kullanıcı Hikâyesi:** Bir cihaz geliştiricisi olarak, ESP32'nin enerji kesintisinden sonra da kimliğini koruyarak sisteme sorunsuz geri dönmesini istiyorum.

#### Kabul Kriterleri

1. WHEN ESP32 NVS'de geçerli bir `ESP32_ID` ve Wi-Fi bilgisi bulduğunda, THE ESP32_Device SHALL AP moduna geçmeden doğrudan Wi-Fi ağına bağlanır.
2. WHEN ESP32 Wi-Fi bağlantısı kurulduktan sonra, THE ESP32_Device SHALL 5 saniyede bir `POST /api/esp32/heartbeat` isteği gönderir.
3. THE ESP32_Device SHALL heartbeat isteğine `esp32_id`, `ip_address` ve `firmware_version` alanlarını ekler.
4. IF heartbeat isteği `404` yanıtı alırsa, THE ESP32_Device SHALL NVS'deki `ESP32_ID`'yi silerek yeniden kayıt sürecini başlatır.
5. IF Wi-Fi bağlantısı kesilirse, THE ESP32_Device SHALL 10 saniyede bir yeniden bağlanmayı dener; 5 başarısız denemeden sonra cihazı yeniden başlatır.
6. THE ESP32_Device SHALL `ESP32_ID` değerini yalnızca sunucu başarılı kayıt yanıtı döndükten sonra NVS'e yazar; kısmi yazım yapılmaz.

---

### Gereksinim 8: Veritabanı Modeli ve Veri Bütünlüğü

**Kullanıcı Hikâyesi:** Bir sistem mimarı olarak, ESP32 verilerinin mevcut veritabanı yapısından bağımsız, tutarlı biçimde saklanmasını istiyorum.

#### Kabul Kriterleri

1. THE ESP32_Server SHALL ESP32 cihaz verilerini `esp32_devices` adlı ayrı bir tabloda saklar; bu tablo mevcut `devices`, `companies`, `locations` tablolarına yabancı anahtar içermez.
2. THE ESP32_Server SHALL `esp32_devices` tablosunda en az şu sütunları bulundurur: `id` (otomatik artan PK), `esp32_tag`, `device_type`, `model`, `mac_address` (benzersiz), `ip_address`, `firmware_version`, `status`, `last_seen`, `created_at`.
3. THE ESP32_Server SHALL `mac_address` sütununa `UNIQUE` kısıtlaması uygular; aynı MAC adresiyle iki farklı kayıt oluşturulamaz.
4. WHEN ESP32 bir cihaz silindiğinde, THE ESP32_Server SHALL yalnızca `esp32_devices` tablosundaki ilgili satırı siler; mevcut `devices` tablosuna dokunmaz.

---

### Gereksinim 9: Gelecek Aşama — RS485/Modbus Entegrasyonu (Kapsam Dışı)

**Not:** Bu gereksinim şu anda implement edilmeyecektir. Spec'e referans olarak eklenmektedir.

**Kullanıcı Hikâyesi:** Bir cihaz geliştiricisi olarak, ESP32 üzerinden RS485/Modbus bağlantısıyla Delta PLC cihazlarını okumak ve SCADA'ya göndermek istiyorum.

#### Kabul Kriterleri (Gelecek Aşama)

1. WHERE RS485/Modbus entegrasyonu etkinleştirilmişse, THE ESP32_Device SHALL yapılandırılmış Modbus register adreslerini okuyarak sunucuya iletir.
2. WHERE RS485/Modbus entegrasyonu etkinleştirilmişse, THE ESP32_Device SHALL PLC model/adres/DI/DO/AI/AO/register bilgilerini otomatik olarak keşfeder.
3. WHERE RS485/Modbus entegrasyonu etkinleştirilmişse, THE ESP32_Server SHALL gelen PLC verilerini mevcut `device_data_routes.py` altyapısıyla işler.

> **⚠️ Kapsam Notu:** Gereksinim 9 bu spec'in implementasyon kapsamı dışındadır. Mimari bağımsızlık ilkesine göre Gereksinimler 1–8, Gereksinim 9 gerçekleştirilmeden tam işlevsel olmalıdır.
