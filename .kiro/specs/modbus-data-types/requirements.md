# Gereksinimler Dokümanı

## Giriş

Bu doküman, OFK-SCADA projesindeki Data Register yapılandırma ekranına veri tipi desteği eklenmesini ve ESP32 firmware'ine Modbus RTU Master okuma yeteneği kazandırılmasını tanımlar. Mevcut "Uzunluk" sütunu kaldırılarak yerine tiplendirilmiş veri tipi seçimi getirilir; ESP32 cihazı, konfigürasyondan gelen register listesini periyodik olarak okur ve sunucuya iletir.

## Sözlük

- **Web_Arayüzü**: OFK-SCADA React tabanlı frontend uygulaması (PlcIoConfigForm bileşeni)
- **Backend**: FastAPI tabanlı sunucu uygulaması (device_data_routes.py)
- **ESP32_Firmware**: ESP32-WROOM-32 üzerinde çalışan gömülü yazılım
- **Modbus_RTU_Master**: RS485 hattı üzerinden FC03 (Read Holding Registers) ile slave cihazlardan register okuyan modül
- **Data_Register_Tablosu**: Web arayüzünde PLC Data Register I/O yapılandırmasını gösteren tablo bileşeni
- **Veri_Tipi**: Bir register adresindeki verinin yorumlanma biçimi (W, INT, DW, DINT, FLT)
- **Word**: 16-bit işaretsiz tamsayı (uint16_t), 1 register adresi kaplar
- **Register_Adresi**: Modbus holding register numarası (0-65535)
- **Otomatik_Adresleme**: Veri tipine göre sonraki satırın register adresinin hesaplanması
- **Delta_DVP**: Delta DVP serisi PLC, 32-bit veriler için LOW WORD önce (little-endian word order) düzeni kullanır
- **Heartbeat**: ESP32'nin periyodik olarak sunucuya gönderdiği durum mesajı

## Gereksinimler

### Gereksinim 1: Veri Tipi Seçimi

**Kullanıcı Hikayesi:** Bir SCADA operatörü olarak, her data register satırı için veri tipini seçmek istiyorum, böylece farklı PLC veri formatlarını doğru şekilde yapılandırabileyim.

#### Kabul Kriterleri

1. THE Web_Arayüzü SHALL Data_Register_Tablosu'nda "Uzunluk" sütunu yerine "Veri Tipi" açılır liste sütunu göstermelidir
2. WHEN kullanıcı veri tipi açılır listesine tıkladığında, THE Web_Arayüzü SHALL şu seçenekleri sunmalıdır: W (Word, uint16_t, 1 word), INT (Integer, int16_t, 1 word), DW (Double Word, uint32_t, 2 word), DINT (Double Integer, int32_t, 2 word), FLT (Float, IEEE-754, 2 word)
3. WHEN yeni bir data register satırı eklendiğinde, THE Web_Arayüzü SHALL varsayılan veri tipini "W" (Word) olarak belirlemelidir
4. THE Web_Arayüzü SHALL her veri tipi seçeneğinin yanında açıklama ve aralık bilgisini göstermelidir

### Gereksinim 2: Otomatik Ardışık Register Adresleme

**Kullanıcı Hikayesi:** Bir SCADA operatörü olarak, register adreslerinin veri tipine göre otomatik hesaplanmasını istiyorum, böylece manuel adres hesaplama hatalarından kaçınabileyim.

#### Kabul Kriterleri

1. THE Web_Arayüzü SHALL ilk satırın başlangıç register adresini kullanıcıdan almalıdır
2. WHEN bir satırın veri tipi W veya INT olarak seçildiğinde, THE Web_Arayüzü SHALL sonraki satırın register adresini mevcut adres + 1 olarak hesaplamalıdır
3. WHEN bir satırın veri tipi DW, DINT veya FLT olarak seçildiğinde, THE Web_Arayüzü SHALL sonraki satırın register adresini mevcut adres + 2 olarak hesaplamalıdır
4. WHEN herhangi bir satırın veri tipi değiştirildiğinde, THE Web_Arayüzü SHALL o satırın altındaki tüm satırların register adreslerini otomatik olarak yeniden hesaplamalıdır
5. THE Web_Arayüzü SHALL her satırın PLC Tag değerini register adresine göre otomatik oluşturmalıdır (örn: adres 4096 → "D0", adres 4098 → "D2")

### Gereksinim 3: Adres Çakışma Koruması

**Kullanıcı Hikayesi:** Bir SCADA operatörü olarak, 2 word'lük veri tiplerinin kapladığı adreslere başka veri yazılmasının engellenmesini istiyorum, böylece veri bütünlüğü korunabilsin.

#### Kabul Kriterleri

1. WHEN bir satır 2 word'lük veri tipi (DW, DINT, FLT) seçildiğinde, THE Web_Arayüzü SHALL ardışık register adresini o satıra ayırmalı ve başka satır tarafından kullanılmasını engellemelidir
2. IF kullanıcı zaten kapılmış bir register adresini manuel olarak girmeye çalışırsa, THEN THE Web_Arayüzü SHALL hata mesajı göstermeli ve girişi reddetmelidir
3. THE Web_Arayüzü SHALL toplam kullanılan word sayısını hesaplamalı ve kullanıcıya göstermelidir

### Gereksinim 4: Modbus İletişim Ayarları

**Kullanıcı Hikayesi:** Bir SCADA operatörü olarak, Modbus okuma periyodu, timeout ve retry sayısını yapılandırmak istiyorum, böylece farklı haberleşme koşullarına uyum sağlayabileyim.

#### Kabul Kriterleri

1. THE Web_Arayüzü SHALL Modbus yapılandırma kartında "Okuma Periyodu (ms)" alanını göstermelidir (varsayılan: 1000, min: 100, max: 60000)
2. THE Web_Arayüzü SHALL Modbus yapılandırma kartında "Timeout (ms)" alanını göstermelidir (varsayılan: 500, min: 50, max: 5000)
3. THE Web_Arayüzü SHALL Modbus yapılandırma kartında "Retry" alanını göstermelidir (varsayılan: 2, min: 0, max: 5)
4. IF kullanıcı belirlenen aralık dışında bir değer girerse, THEN THE Web_Arayüzü SHALL değeri en yakın geçerli sınıra otomatik düzeltmelidir

### Gereksinim 5: Güncellenmiş JSON Veri Formatı

**Kullanıcı Hikayesi:** Bir sistem geliştirici olarak, plc_io_config JSON yapısının veri tipi bilgisini içermesini istiyorum, böylece backend ve firmware doğru şekilde veri işleyebilsin.

#### Kabul Kriterleri

1. THE Backend SHALL `plc_io_config.dataRegisters` dizisindeki her öğede `dataType` alanını kabul etmelidir ("W" | "INT" | "DW" | "DINT" | "FLT")
2. THE Backend SHALL `plc_io_config.dataRegisters` öğelerinde `length` alanını artık zorunlu tutmamalıdır
3. THE Backend SHALL `modbus_config` nesnesinde `readInterval`, `timeout` ve `retryCount` alanlarını kabul etmelidir
4. WHEN bir data register kaydedildiğinde, THE Web_Arayüzü SHALL JSON çıktısında `length` yerine `dataType` alanını kullanmalıdır
5. THE Backend SHALL `dataType` değerinden word sayısını otomatik çıkarabilmelidir (W/INT→1, DW/DINT/FLT→2)

### Gereksinim 6: ESP32 Modbus RTU Master Okuma

**Kullanıcı Hikayesi:** Bir SCADA mühendisi olarak, ESP32'nin bağlı PLC'den Modbus RTU ile register okuyabilmesini istiyorum, böylece saha verisi gerçek zamanlı toplanabilsin.

#### Kabul Kriterleri

1. THE ESP32_Firmware SHALL RS485 pinlerini (RX=GPIO16, TX=GPIO17, DE/RE=GPIO4) kullanarak Modbus RTU Master modunda çalışmalıdır
2. THE ESP32_Firmware SHALL sunucudan gelen `dataRegisters` konfigürasyonunu parse edebilmelidir
3. WHEN okuma periyodu dolduğunda, THE Modbus_RTU_Master SHALL ardışık register adreslerini tek FC03 isteği ile topluca okumalıdır
4. THE Modbus_RTU_Master SHALL okunan ham veriyi `dataType` alanına göre doğru C tipine dönüştürmelidir (W→uint16_t, INT→int16_t, DW→uint32_t, DINT→int32_t, FLT→float)
5. WHEN 32-bit veri okunduğunda (DW, DINT, FLT), THE Modbus_RTU_Master SHALL Delta DVP byte sırasını uygulamalıdır (D0=LOW WORD, D1=HIGH WORD)
6. IF bir Modbus okuma isteği timeout ile başarısız olursa, THEN THE Modbus_RTU_Master SHALL yapılandırılan retry sayısı kadar tekrar denemelidir
7. IF tüm retry denemeleri başarısız olursa, THEN THE ESP32_Firmware SHALL hata durumunu loglayarak bir sonraki periyoda geçmelidir

### Gereksinim 7: ESP32 Veri Gönderimi

**Kullanıcı Hikayesi:** Bir SCADA mühendisi olarak, ESP32'nin okuduğu register verilerini sunucuya JSON formatında göndermesini istiyorum, böylece veriler merkezi sistemde depolanabilsin.

#### Kabul Kriterleri

1. THE ESP32_Firmware SHALL okunan register verilerini `POST /api/device-data` endpoint'ine göndermelidir
2. THE ESP32_Firmware SHALL gönderim payload'ında `deviceId`, `timestamp`, `type: "plc"`, `subtype: "dvp_ss2"` alanlarını içermelidir
3. THE ESP32_Firmware SHALL `data.dataRegisters` nesnesinde her register değerini PLC Tag anahtarı ile göndermelidir (örn: "D0": 75823, "D2": 2450, "D3": 45.67)
4. WHEN cihaz durumu "offline" olarak ayarlandığında, THE ESP32_Firmware SHALL veri gönderimini durdurmalıdır
5. IF sunucu HTTP 200 dışında yanıt verirse, THEN THE ESP32_Firmware SHALL hatayı loglamalı ve bir sonraki periyotta tekrar denemelidir

### Gereksinim 8: Geriye Uyumluluk

**Kullanıcı Hikayesi:** Bir sistem yöneticisi olarak, mevcut sistemin veri tipi özelliği eklendikten sonra bozulmamasını istiyorum, böylece çalışan cihazlar ve yapılandırmalar etkilenmesin.

#### Kabul Kriterleri

1. THE Backend SHALL eski formattaki `length` alanını içeren kayıtları hatasız işlemeye devam etmelidir
2. THE Web_Arayüzü SHALL eski formattaki kayıtları yüklerken `length` değerinden uygun `dataType` değerini otomatik çıkarmalıdır (length=1→"W", length=2→"DW")
3. THE Web_Arayüzü SHALL mevcut coil listesi yapılandırmasını değiştirmemelidir
4. THE Backend SHALL mevcut login, dashboard, firma, lokasyon ve kullanıcı yapılarını etkilememelidir
