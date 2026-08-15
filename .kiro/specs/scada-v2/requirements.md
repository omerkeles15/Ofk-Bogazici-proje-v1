# Gereksinimler Belgesi — OFK-SCADA v2

## Giriş

Bu belge, OFK-SCADA platformunun kapsamlı v2 yükseltmesini tanımlar. Yükseltme 7 grup altında 16 özellik içermektedir:

- **Grup 1** — ESP32 HTTP yönlendirme hatası düzeltmesi ve firmware versiyonlama
- **Grup 2** — Cihaz listesi düzenleme ve tag/coil/register çapraz-senkronizasyonu
- **Grup 3** — MAC adresi tabanlı ESP32 kimliği, provisioning geliştirmesi, Bağlı Cihazlar sayfası
- **Grup 4** — Cihaz ekleme akışı (ESP32 dropdown, ilk kayıt tam config, sonraki diff)
- **Grup 5** — Pasif cihaz bildirimi (kullanıcıya uyarı + ESP32'ye status)
- **Grup 6** — Birim fiyat ve finans/hesap yönetimi paneli
- **Grup 7** — 1000+ ESP32 ölçeklenebilirliği (async heartbeat kuyruğu + compact diff protokolü)

Mevcut giriş, dashboard, firma, lokasyon, kullanıcı ve yetkilendirme altyapısı değiştirilmez.

---

## Sözlük

- **Sistem**: OFK-SCADA web uygulaması ve backend API bütünü
- **Backend**: FastAPI + SQLAlchemy async + PostgreSQL + Redis katmanı
- **Frontend**: React 18 + Zustand + Tailwind CSS SPA uygulaması
- **Firmware**: ESP32 üzerinde çalışan ArduinoJson v7 tabanlı C++ yazılımı
- **ESP32**: Saha veri toplayıcı mikrodenetleyici cihaz
- **Device**: SCADA veri tabanındaki mantıksal cihaz kaydı (`devices` tablosu)
- **ESP32Device**: Fiziksel ESP32'nin kayıt kaydı (`esp32_devices` tablosu)
- **MAC_Adresi**: ESP32'nin fabrikadan gelen benzersiz donanım tanımlayıcısı
- **plc_io_config**: Coil ve register adreslerini + tag isimlerini içeren tek kaynak JSON
- **Heartbeat**: ESP32'nin her 5 saniyede bir sunucuya gönderdiği durum bildirimi
- **Pending_Config**: ESP32'ye iletilmeyi bekleyen yapılandırma işareti
- **Diff_Payload**: Yalnızca değişen alanları içeren kısmi güncelleme paketi
- **Provisioning**: ESP32'nin AP modunda ilk ağ ve sunucu ayarlarını aldığı kurulum süreci
- **Ngrok**: Yerel sunucuyu HTTPS tüneli ile dışa açan araç
- **Admin**: `role = "admin"` kullanıcısı
- **Firma_Kullanıcısı**: Bir firmaya bağlı `company_manager`, `location_manager` veya `user` rolündeki kullanıcı
- **Birim_Fiyat**: Bir Device için admin tarafından aylık bazda atanan TL cinsinden ücret

---

## Gereksinimler

### Gereksinim 1: ESP32 HTTP 307 Yönlendirme Hatası Düzeltmesi

**Kullanıcı Hikayesi:** Saha teknisyeni olarak, ESP32'nin ngrok HTTPS yönlendirmelerini otomatik takip etmesini istiyorum; böylece elle müdahale olmadan sunucuya bağlanabilsin.

#### Kabul Kriterleri

1. THE Firmware SHALL `HTTPClient.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS)` çağrısını tüm HTTP istek fonksiyonlarında (`registerDevice`, `sendHeartbeat`) uygular.
2. THE Firmware SHALL tüm HTTP istemci isteklerine `ngrok-skip-browser-warning: 1` başlığını ekler.
3. WHEN provisioning formuna `http://` ile başlayan ve yerel IP (`192.168.x.x`, `10.x.x.x`, `172.16.x.x`–`172.31.x.x`) içermeyen bir sunucu URL'si girildiğinde, THE Firmware SHALL URL'yi `https://`'e dönüştürür ve NVS'e `https://` olarak kaydeder.
4. WHEN provisioning formu gönderildiğinde ve URL `http://192.168.` veya `http://10.` ile başladığında, THE Firmware SHALL URL'yi olduğu gibi korur ve değiştirmez.

---

### Gereksinim 2: Firmware Versiyon Güncelleme

**Kullanıcı Hikayesi:** Sistem yöneticisi olarak, bağlı ESP32 cihazlarının hangi firmware versiyonunda çalıştığını takip etmek istiyorum.

#### Kabul Kriterleri

1. THE Firmware SHALL `FIRMWARE_VERSION` sabitini `"1.4.0"` olarak tanımlar.
2. WHEN ESP32 register isteği gönderdiğinde, THE Firmware SHALL `firmware_version` alanını `"1.4.0"` olarak gönderir.
3. WHEN ESP32 heartbeat gönderdiğinde, THE Firmware SHALL `firmware_version` alanını `"1.4.0"` olarak gönderir.

---

### Gereksinim 3: Cihaz Listesi Düzenleme Butonu

**Kullanıcı Hikayesi:** Admin olarak, `/admin/devices` cihaz listesinden doğrudan cihaz düzenleyebilmek istiyorum; böylece firma detay sayfasına gitmek zorunda kalmayayım.

#### Kabul Kriterleri

1. THE Sistem SHALL `/admin/devices` sayfasındaki her cihaz satırına "Düzenle" butonu ekler.
2. WHEN admin "Düzenle" butonuna tıkladığında, THE Sistem SHALL mevcut cihaz bilgileriyle doldurulmuş bir düzenleme modalı açar.
3. WHEN admin modal üzerinden cihazı kaydettiğinde, THE Sistem SHALL aynı `updateDevice` store action'ını kullanır ve değişikliği backend'e `PUT /api/companies/{cid}/locations/{lid}/devices/{id}` ile iletir.
4. WHEN `updateDevice` action'ı başarılı döndüğünde, THE Sistem SHALL hem `/admin/devices` listesini hem de firma/lokasyon ağacını senkronize eder.

---

### Gereksinim 4: Tag / Coil / Register Senkronizasyonu

**Kullanıcı Hikayesi:** Admin olarak, bir cihazın tag ismini veya I/O adresini hangi sayfadan değiştirirsem değiştireyim, değişikliğin tüm ekranlara anında yansımasını istiyorum.

#### Kabul Kriterleri

1. THE Sistem SHALL `Device.plc_io_config` JSON alanını tüm tag/coil/register bilgisinin tek kaynağı olarak kullanır.
2. WHEN cihaz listesi, lokasyon düzenleme veya izleme sayfasından herhangi bir tag ismi, coil adresi veya PLC tag değiştirildiğinde, THE Sistem SHALL değişikliği `PUT /api/companies/{cid}/locations/{lid}/devices/{id}` endpoint'i üzerinden backend'e kaydeder.
3. WHEN backend kayıt başarılı olduğunda, THE Sistem SHALL Zustand store'unu `updateDevice` action'ı ile günceller.
4. WHEN Zustand store güncellendiğinde, THE Sistem SHALL `plc_io_config` verisini görüntüleyen tüm bileşenler (cihaz listesi, lokasyon kartı, izleme sayfası) yeni değerleri otomatik olarak gösterir.
5. WHEN `plc_io_config` değiştirildiğinde ve cihaza bağlı bir ESP32 mevcutsa, THE Backend SHALL bağlı ESP32'nin `pending_config` işaretini `true` olarak günceller ve yeni yapılandırmayı `config_json`'a yazar.

---

### Gereksinim 5: İzleme Sayfası Satır İçi Düzenleme

**Kullanıcı Hikayesi:** Kullanıcı olarak, izleme sayfasından I/O tag isimlerini satır içi düzenleyebilmek; admin olarak ayrıca coil adresi ve PLC tag'ını da değiştirebilmek istiyorum.

#### Kabul Kriterleri

1. THE Sistem SHALL izleme sayfasından "I/O Yapılandırmasını Düzenle" butonunu kaldırır.
2. THE Sistem SHALL izleme sayfasındaki her tag ismi hücresini tıklanabilir satır içi düzenleme alanı yapar.
3. WHILE kullanıcı rolü `user`, `location_manager` veya `company_manager` iken, THE Sistem SHALL yalnızca tag ismi alanlarını düzenlenebilir yapar; coil adresi ve PLC tag alanlarını salt okunur gösterir.
4. WHILE kullanıcı rolü `admin` iken, THE Sistem SHALL tag ismi, coil adresi ve PLC tag alanlarının tamamını satır içi düzenlenebilir yapar.
5. WHEN "Değişiklikleri Kaydet" butonuna tıklandığında ve I/O alanlarında değişiklik varsa, THE Backend SHALL yalnızca değişen coil/register adreslerini ve tag isimlerini içeren diff payload'u ESP32'ye iletmek için `pending_config`'i günceller.
6. THE Sistem SHALL kayıt butonunun adını "Tag İsimlerini Kaydet" yerine "Değişiklikleri Kaydet" olarak gösterir.

---

### Gereksinim 6: MAC Adresi Tabanlı Tekil ESP32 Kimliği

**Kullanıcı Hikayesi:** Sistem yöneticisi olarak, aynı IP adresi farklı ağ lokasyonlarında kullanılsa bile her ESP32'nin kendi MAC adresiyle benzersiz tanımlanmasını istiyorum.

#### Kabul Kriterleri

1. THE Backend SHALL `ESP32Device.mac_address` alanına `UNIQUE` kısıtı uygular ve çakışma kontrolünü MAC adresi üzerinden yapar.
2. WHEN yeni bir ESP32 kayıt isteği geldiğinde ve aynı MAC adresiyle kayıtlı bir ESP32Device varsa, THE Backend SHALL kayıt oluşturmaz; mevcut kaydı günceller ve `status: "exists"` döndürür.
3. WHEN yeni bir ESP32 kayıt isteği geldiğinde ve MAC adresi yoksa, THE Backend SHALL yeni ESP32Device kaydı oluşturur ve `status: "registered"` döndürür.
4. THE Sistem SHALL aynı IP adresinin farklı MAC adresleriyle birden fazla ESP32Device kaydında görünmesine izin verir.

---

### Gereksinim 7: Provisioning Formuna Firma/Lokasyon Ekleme

**Kullanıcı Hikayesi:** Saha teknisyeni olarak, ESP32 kurulum formunda firmayı ve lokasyonu seçebilmek istiyorum; böylece cihaz sunucuya kaydolurken bu bilgiyi de gönderebilsin.

#### Kabul Kriterleri

1. THE Firmware SHALL provisioning formuna opsiyonel "Firma" ve "Lokasyon" seçim alanları ekler.
2. WHEN ESP32 AP modundaki provisioning sayfası yüklendiğinde, THE Firmware SHALL `/api/companies` endpoint'inden firma listesini HTTP ile çeker ve dropdown olarak gösterir.
3. WHEN kullanıcı firma seçtiğinde, THE Firmware SHALL seçilen firmanın lokasyonlarını ikinci dropdown olarak gösterir.
4. WHEN provisioning formu gönderildiğinde, THE Firmware SHALL seçili `company_id` ve `location_id` değerlerini register isteğine opsiyonel alan olarak ekler.
5. WHEN backend register isteğini aldığında ve `company_id` ile `location_id` mevcutsa, THE Backend SHALL bu değerleri `ESP32Device` kaydında saklar.
6. WHEN backend register isteğini aldığında ve `company_id` veya `location_id` yoksa, THE Backend SHALL kaydı `null` değerlerle oluşturur ve hata döndürmez.

---

### Gereksinim 8: Bağlı Cihazlar Sayfası Güncellemeleri

**Kullanıcı Hikayesi:** Admin olarak, Bağlı Cihazlar sayfasında ESP32 tag'larını düzenleyebilmek, cihaz silebilmek, MAC çakışmalarını görebilmek ve firma/lokasyon bilgisini takip edebilmek istiyorum.

#### Kabul Kriterleri

1. THE Sistem SHALL Bağlı Cihazlar tablosuna "Firma" ve "Lokasyon" sütunları ekler.
2. THE Sistem SHALL her ESP32 satırına satır içi tag düzenleme özelliği ekler.
3. WHEN admin bir ESP32'nin tag'ını satır içi değiştirip kaydettiğinde, THE Backend SHALL `ESP32Device.esp32_tag` alanını günceller ve bağlı Device varsa tam config'i yeniden `pending_config` olarak işaretler.
4. WHEN admin "Sil" butonuna tıkladığında, THE Sistem SHALL onay dialogu gösterir; onaylanırsa THE Backend SHALL `ESP32Device` kaydını siler ve bağlı `Device.esp32_id` alanını `null` yapar.
5. WHEN aynı MAC adresli bir ESP32 farklı bir tag ile tekrar kayıt isteği gönderdiğinde, THE Backend SHALL mevcut kaydın tag'ını güncellemez; uyarı işareti (`conflict: true`) alanını `true` yapar ve ESP32'yi `status: "conflict"` olarak işaretler.
6. THE Sistem SHALL `conflict: true` olan ESP32 satırlarını uyarı simgesi (⚠️) ile gösterir.
7. THE Sistem SHALL zaten bir Device'a bağlı olan ESP32'leri cihaz ekleme/düzenleme dropdown'unda `disabled` ve `"(kullanımda)"` etiketiyle gösterir.

---

### Gereksinim 9: Cihaz Formunda ESP32 Dropdown — Kullanımdaki Cihazlar Devre Dışı

**Kullanıcı Hikayesi:** Admin olarak, cihaz ekleme veya düzenleme formundaki ESP32 seçiminde hangi cihazların başka bir Device'a bağlı olduğunu görmek ve bunları yanlışlıkla seçememek istiyorum.

#### Kabul Kriterleri

1. WHEN cihaz ekleme veya düzenleme formu açıldığında, THE Sistem SHALL ESP32 dropdown'ında tüm kayıtlı ESP32 cihazlarını listeler.
2. WHILE bir ESP32Device kaydının `device_id` alanı dolu ve bu `device_id` düzenlenmekte olan cihazın ID'si değilken, THE Sistem SHALL o ESP32'yi dropdown'da `disabled` özelliğiyle ve `"(kullanımda)"` ek etiketiyle gösterir.
3. WHILE bir ESP32Device kaydının `device_id` alanı `null` iken, THE Sistem SHALL o ESP32'yi seçilebilir olarak gösterir.

---

### Gereksinim 10: İlk Kayıt Sırasında ESP32'ye Tam Config Bildirimi

**Kullanıcı Hikayesi:** Admin olarak, yeni bir cihaz ekleyip ESP32 seçince, ESP32'nin hemen tüm yapılandırmayı almasını istiyorum; böylece ayrıca el ile config göndermek zorunda kalmayayım.

#### Kabul Kriterleri

1. WHEN admin yeni Device oluştururken bir ESP32 seçtiğinde, THE Backend SHALL `ESP32Device` ile `Device` arasında link kurar ve full config payload'u gönderir.
2. THE Backend SHALL full config payload'unun şu alanları içermesini sağlar: `device_id`, `device_type`, `company_name`, `location_name`, `modbus_config`, `plc_io_config`.
3. THE Backend SHALL full config payload'u `ESP32Device.config_json`'a yazar ve `pending_config = true` olarak işaretler.
4. WHEN ESP32 bir sonraki heartbeat'ini gönderdiğinde ve `pending_config = true` ise, THE Backend SHALL `config` alanını heartbeat yanıtına ekler.
5. WHEN ESP32 config'i aldıktan sonra bir sonraki heartbeat'inde `config_ack: true` gönderdiğinde, THE Backend SHALL `pending_config = false` yapar.

---

### Gereksinim 11: Sonraki Değişikliklerde Diff Bildirimi

**Kullanıcı Hikayesi:** Admin olarak, mevcut bir cihazın yapılandırması değiştirildiğinde ESP32'ye yalnızca değişen alanların gönderilmesini istiyorum; böylece bant genişliği boşa harcanmasın.

#### Kabul Kriterleri

1. WHEN mevcut bir Device'ın `plc_io_config`, `modbus_config` veya `tag_name` alanı değiştirildiğinde ve bu Device'a bağlı ESP32 mevcutsa, THE Backend SHALL değişen alanları önceki değerlerle karşılaştırır.
2. THE Backend SHALL diff payload şu alanları içerir: `device_id`, `diff: true` işareti ve yalnızca değişen `coils`, `dataRegisters` veya `tag_name` alanları.
3. WHEN diff hesaplandığında ve değişen alan yoksa, THE Backend SHALL `pending_config` güncellemesi yapmaz.

---

### Gereksinim 12: Pasif Cihaz Bildirimi

**Kullanıcı Hikayesi:** Admin olarak, bir cihazı pasife aldığımda hem ESP32'nin bunu öğrenmesini hem de o firmadaki kullanıcıların uyarı görmesini istiyorum.

#### Kabul Kriterleri

1. WHEN admin bir Device'ı pasife aldığında (`status = "offline"`), THE Backend SHALL cihaza bağlı ESP32'ye `device_status: "offline"` içeren config payload'u gönderir.
2. WHEN admin bir Device'ı pasife aldığında, THE Backend SHALL bu olayı bir bildirim kanalında (`notifications` Redis pub/sub veya WebSocket) yayınlar.
3. WHEN pasif cihaz bildirimi yayınlandığında, THE Sistem SHALL aynı firmadaki tüm aktif oturum açık Firma_Kullanıcısı ekranlarında "Bu cihaz admin tarafından pasife alınmıştır." uyarı mesajını gösterir.
4. WHEN admin bir Device'ı tekrar aktife aldığında, THE Sistem SHALL uyarı mesajını gizler.

---

### Gereksinim 13: Cihaz Bazlı Birim Fiyat

**Kullanıcı Hikayesi:** Admin olarak, her Device için aylık birim fiyat atayabilmek istiyorum; böylece faturalandırma hesaplamaları yapılabilsin.

#### Kabul Kriterleri

1. THE Backend SHALL `Device` modeline `unit_price` alanı ekler (NUMERIC(10,2), default 0).
2. WHEN admin bir Device'a birim fiyat atadığında, THE Backend SHALL değeri `PUT /api/companies/{cid}/locations/{lid}/devices/{id}` endpoint'i üzerinden kaydeder.
3. THE Sistem SHALL cihaz ekleme ve düzenleme formlarına "Birim Fiyat (₺)" giriş alanı ekler.
4. WHEN `unit_price` 0'dan büyük bir değere ayarlandığında, THE Sistem SHALL cihaz listesinde birim fiyatı gösterir.

---

### Gereksinim 14: Finans Paneli — Hesap Yönetimi

**Kullanıcı Hikayesi:** Admin olarak, tüm firmaların faturalandırılabilir cihaz listesini, lokasyon bazlı ara toplamları ve aylık gelir özetini tek bir sayfada görmek istiyorum.

#### Kabul Kriterleri

1. THE Sistem SHALL sol menüye "💰 Hesap Yönetimi" bağlantısı ekler ve bu bağlantıyı yalnızca `admin` rolüne gösterir.
2. THE Sistem SHALL Hesap Yönetimi sayfasında firma bazında gruplandırılmış cihaz listesi, birim fiyatlar ve lokasyon bazlı ara toplam gösterir.
3. WHILE bir Device'ın `status` alanı `"online"` iken, THE Sistem SHALL bu cihazı fatura hesaplamalarına dahil eder.
4. WHILE bir Device'ın `status` alanı `"offline"` iken, THE Sistem SHALL bu cihazı fatura hesaplamalarına dahil etmez.
5. THE Sistem SHALL tüm firmalar için aylık gelir özetini tablo formatında hesaplar ve gösterir: firma adı, aktif cihaz sayısı, toplam tutar.
6. THE Backend SHALL `/api/finance/summary` endpoint'i sağlar ve firma bazlı toplam + cihaz detaylarını döndürür.

---

### Gereksinim 15: Async Heartbeat Kuyruğu

**Kullanıcı Hikayesi:** Sistem yöneticisi olarak, 1000'den fazla ESP32 eş zamanlı heartbeat gönderdiğinde veritabanı ve API performansının düşmemesini istiyorum.

#### Kabul Kriterleri

1. WHEN heartbeat endpoint'ine istek geldiğinde, THE Backend SHALL isteği önce Redis listesine (`heartbeat_queue`) enqueue eder ve 200 OK döndürür.
2. THE Backend SHALL `heartbeat_worker` adlı async background task'ı her 1 saniyede bir Redis kuyruğundan en fazla 200 heartbeat alır ve toplu olarak işler.
3. WHEN heartbeat_worker kuyruğu işlediğinde, THE Backend SHALL tüm `ESP32Device.last_seen` ve `ip_address` güncellemelerini tek bir toplu SQL sorgusuyla yazar.
4. WHEN Redis bağlantısı kurulamazsa, THE Backend SHALL heartbeat isteğini doğrudan veritabanına yazarak geriye dönüş (fallback) davranışı uygular.
5. THE Backend SHALL heartbeat kuyruğu işleme süresini 500 ms altında tutar (normal koşullar, 1000 eş zamanlı bağlantı).

---

### Gereksinim 16: Compact Diff Protokolü

**Kullanıcı Hikayesi:** Sistem yöneticisi olarak, ESP32 ile sunucu arasında iletilen config mesajlarının yalnızca değişen alanları içermesini istiyorum; böylece ağ trafiği ve JSON parse süresi minimize edilsin.

#### Kabul Kriterleri

1. WHEN ESP32'ye iletilecek config payload'u oluşturulduğunda ve bu ilk kayıt değilse, THE Backend SHALL mevcut `config_json` ile yeni değerleri karşılaştırır ve yalnızca değişen alanları içeren diff yapısı oluşturur.
2. THE Backend SHALL diff payload için aşağıdaki minimal formatı kullanır: `{"diff": true, "device_id": "...", "changed": {"coils": [...], "dataRegisters": [...]}}`.
3. WHEN full config gerektiğinde (ilk bağlantı veya `force_full: true` isteği), THE Backend SHALL `"diff": false` ile tam payload gönderir.
4. WHEN Firmware diff payload aldığında (`diff: true`), THE Firmware SHALL yalnızca `changed` anahtarındaki alanları günceller; mevcut yapılandırmanın geri kalanını korur.
5. WHEN Firmware full payload aldığında (`diff: false` veya `diff` yoksa), THE Firmware SHALL tüm yapılandırmayı yeniden yazar.
