# Gereksinimler Belgesi

## Giriş

Bu özellik, OFK-SCADA sistemindeki PLC cihazları için I/O yapılandırma formunu yeniden tasarlar. Mevcut formda dijital giriş/çıkış sayıları sabit adımlı dropdown menülerle, analog kanallar veri tipi seçimiyle, data register ise başlangıç-bitiş aralığıyla tanımlanmaktadır. Yeni tasarımda her bölüm için kullanıcı serbest sayı girerek satır bazlı bir tablo elde eder; her satırda PLC tag, adres, uzunluk, tag ismi ve açıklama alanları bulunur. Eski `digitalInputs/digitalOutputs/analogInputs/analogOutputs/dataRegister` yapısının yerini `coils[]`, `analogChannels[]`, `dataRegisters[]` dizileri alır. Yeni yapılandırma bileşeni hem "Cihaz Ekle" hem "Cihaz Düzenle" modallarında ortak kullanılır.

## Sözlük

- **PLC_IO_Form**: PLC tipindeki cihazlar için I/O noktalarını yapılandıran React form bileşeni.
- **Coil**: Modbus protokolünde bit değeri tutan adreslenebilir I/O noktası (X, Y, M, S, T, C vb. PLC etiketleri).
- **CoilSatır**: Coil listesindeki tek bir satırı temsil eden veri nesnesi; `plcTag`, `coilAddress`, `tagName`, `description` alanlarını içerir.
- **AnalogKanal**: Analog giriş (AI) veya analog çıkış (AO) register'ını temsil eden veri nesnesi; `plcTag`, `registerAddress`, `length`, `tagName`, `description` alanlarını içerir.
- **DataRegisterSatır**: Data register (D) adresini temsil eden veri nesnesi; `plcTag`, `registerAddress`, `length`, `tagName`, `description` alanlarını içerir.
- **PlcIoConfig**: `coils`, `analogChannels`, `dataRegisters` dizilerini barındıran üst düzey JSON nesnesi; backend'de `devices.plc_io_config` sütununa kaydedilir.
- **AdetInput**: Kullanıcının bir bölüm için kaç satır oluşturacağını belirlediği `type="number"` giriş alanı.
- **IoTablo**: Belirli bir I/O bölümüne ait satırları tablo biçiminde gösteren ve düzenlenebilir hücreleri olan bileşen bölümü.
- **AdminCompanyDetail**: PLC cihaz ekleme ve düzenleme modallarını barındıran admin sayfası.

---

## Gereksinimler

### Gereksinim 1: Coil Listesi Bölümü

**Kullanıcı Hikayesi:** Bir otomasyon mühendisi olarak, PLC'nin dijital I/O noktalarını (X, Y, M, C, T, S vb.) esnek biçimde tanımlamak istiyorum; böylece her Coil noktasının PLC etiketini, Modbus adresini, tag ismini ve açıklamasını doğrudan foruma girebilirim.

#### Kabul Kriterleri

1. WHEN kullanıcı PLC alt tipi seçtiğinde, THE PLC_IO_Form SHALL `coils` bölümünü göstermelidir ve başlangıç değeri olarak boş dizi (`[]`) kullanmalıdır.
2. WHEN kullanıcı AdetInput'a pozitif bir tam sayı girdiğinde, THE PLC_IO_Form SHALL mevcut `coils` dizisini o sayıya pad veya truncate ederek güncellemelidir.
3. WHILE `coils` dizisinin uzunluğu sıfırdan büyük olduğunda, THE PLC_IO_Form SHALL her satır için `plcTag` (serbest metin), `coilAddress` (sayı), `tagName` (serbest metin) ve `description` (serbest metin) alanlarını içeren düzenlenebilir bir tablo satırı göstermelidir.
4. WHEN kullanıcı AdetInput'u küçük bir sayıya düşürdüğünde, THE PLC_IO_Form SHALL truncate ettiği satırların başındaki satırları korumalı ve yalnızca sondaki fazlalık satırları kaldırmalıdır.
5. WHEN kullanıcı AdetInput'u büyük bir sayıya artırdığında, THE PLC_IO_Form SHALL mevcut satırları koruyarak fark kadar yeni boş satır eklemelidir; yeni satırların varsayılan değerleri `plcTag: ""`, `coilAddress: 0`, `tagName: ""`, `description: ""` olmalıdır.
6. WHEN kullanıcı bir satırdaki × butonuna tıkladığında, THE PLC_IO_Form SHALL o satırı `coils` dizisinden kaldırmalı ve AdetInput değerini güncel uzunluğa eşitlemelidir.
7. THE PLC_IO_Form SHALL `coils` bölümünü scroll edilebilir bir kap içinde göstermelidir; böylece çok sayıda satır formun geri kalanını gizlemez.

---

### Gereksinim 2: Analog Kanallar Bölümü

**Kullanıcı Hikayesi:** Bir otomasyon mühendisi olarak, PLC'nin analog giriş/çıkış kanallarını (AI, AO) tek bir bölümden yönetmek istiyorum; böylece her kanalın register adresini, uzunluğunu, tag ismini ve açıklamasını girebilirim.

#### Kabul Kriterleri

1. WHEN kullanıcı PLC alt tipi seçtiğinde, THE PLC_IO_Form SHALL `analogChannels` bölümünü göstermelidir ve başlangıç değeri olarak boş dizi (`[]`) kullanmalıdır.
2. WHEN kullanıcı AdetInput'a pozitif bir tam sayı girdiğinde, THE PLC_IO_Form SHALL mevcut `analogChannels` dizisini o sayıya pad veya truncate ederek güncellemelidir.
3. WHILE `analogChannels` dizisinin uzunluğu sıfırdan büyük olduğunda, THE PLC_IO_Form SHALL her satır için `plcTag` (serbest metin), `registerAddress` (sayı), `length` (sayı, 1=Word, 2=DWord), `tagName` (serbest metin) ve `description` (serbest metin) alanlarını içeren düzenlenebilir bir tablo satırı göstermelidir.
4. WHEN kullanıcı AdetInput'u küçük bir sayıya düşürdüğünde, THE PLC_IO_Form SHALL truncate ettiği satırların başındaki satırları korumalı ve yalnızca sondaki fazlalık satırları kaldırmalıdır.
5. WHEN kullanıcı AdetInput'u büyük bir sayıya artırdığında, THE PLC_IO_Form SHALL mevcut satırları koruyarak fark kadar yeni boş satır eklemelidir; yeni satırların varsayılan değerleri `plcTag: ""`, `registerAddress: 0`, `length: 1`, `tagName: ""`, `description: ""` olmalıdır.
6. WHEN kullanıcı bir satırdaki × butonuna tıkladığında, THE PLC_IO_Form SHALL o satırı `analogChannels` dizisinden kaldırmalı ve AdetInput değerini güncel uzunluğa eşitlemelidir.
7. THE PLC_IO_Form SHALL `analogChannels` bölümünü scroll edilebilir bir kap içinde göstermelidir.

---

### Gereksinim 3: Data Register Bölümü

**Kullanıcı Hikayesi:** Bir otomasyon mühendisi olarak, PLC'nin data register (D) noktalarını tek tek tanımlamak istiyorum; böylece her register adresini, uzunluğunu, tag ismini ve açıklamasını girebilirim.

#### Kabul Kriterleri

1. WHEN kullanıcı PLC alt tipi seçtiğinde, THE PLC_IO_Form SHALL `dataRegisters` bölümünü göstermelidir ve başlangıç değeri olarak boş dizi (`[]`) kullanmalıdır.
2. WHEN kullanıcı AdetInput'a pozitif bir tam sayı girdiğinde, THE PLC_IO_Form SHALL mevcut `dataRegisters` dizisini o sayıya pad veya truncate ederek güncellemelidir.
3. WHILE `dataRegisters` dizisinin uzunluğu sıfırdan büyük olduğunda, THE PLC_IO_Form SHALL her satır için `plcTag` (serbest metin), `registerAddress` (sayı), `length` (sayı), `tagName` (serbest metin) ve `description` (serbest metin) alanlarını içeren düzenlenebilir bir tablo satırı göstermelidir.
4. WHEN kullanıcı AdetInput'u küçük bir sayıya düşürdüğünde, THE PLC_IO_Form SHALL truncate ettiği satırların başındaki satırları korumalı ve yalnızca sondaki fazlalık satırları kaldırmalıdır.
5. WHEN kullanıcı AdetInput'u büyük bir sayıya artırdığında, THE PLC_IO_Form SHALL mevcut satırları koruyarak fark kadar yeni boş satır eklemelidir; yeni satırların varsayılan değerleri `plcTag: ""`, `registerAddress: 0`, `length: 1`, `tagName: ""`, `description: ""` olmalıdır.
6. WHEN kullanıcı bir satırdaki × butonuna tıkladığında, THE PLC_IO_Form SHALL o satırı `dataRegisters` dizisinden kaldırmalı ve AdetInput değerini güncel uzunluğa eşitlemelidir.
7. THE PLC_IO_Form SHALL `dataRegisters` bölümünü scroll edilebilir bir kap içinde göstermelidir.

---

### Gereksinim 4: Paylaşımlı Bileşen ve Modal Entegrasyonu

**Kullanıcı Hikayesi:** Bir geliştirici olarak, I/O yapılandırma formunun hem "Cihaz Ekle" hem "Cihaz Düzenle" modallarında tekrar eden kod olmadan çalışmasını istiyorum; böylece bakım yükü azalır ve iki modal tutarlı davranır.

#### Kabul Kriterleri

1. THE PLC_IO_Form SHALL bağımsız bir React bileşeni olarak tanımlanmalı; `value` (PlcIoConfig) ve `onChange` (fonksiyon) prop'larını kabul etmelidir.
2. WHEN AdminCompanyDetail'deki "Cihaz Ekle" modalı açıldığında, THE PLC_IO_Form SHALL `value` olarak `{ coils: [], analogChannels: [], dataRegisters: [] }` ile başlatılmalıdır.
3. WHEN AdminCompanyDetail'deki "Cihaz Düzenle" modalı açıldığında, THE PLC_IO_Form SHALL `value` olarak mevcut cihazın `plcIoConfig` verisiyle başlatılmalıdır; eski formatta (`digitalInputs`, `analogInputs` vb.) kaydedilmiş veriler için boş yapı kullanılmalıdır.
4. WHEN PLC_IO_Form içindeki herhangi bir alan değiştiğinde, THE PLC_IO_Form SHALL güncel PlcIoConfig nesnesini `onChange` callback'i aracılığıyla ebeveyn bileşene iletmelidir.
5. THE PLC_IO_Form SHALL `deviceCatalog.js` içindeki `DEFAULT_PLC_IO_CONFIG` sabitini artık kullanmamalıdır; başlangıç değerleri her zaman boş dizilerden oluşan yeni yapıyı yansıtmalıdır.

---

### Gereksinim 5: Yeni PlcIoConfig JSON Şeması

**Kullanıcı Hikayesi:** Bir sistem entegratörü olarak, kaydedilen `plc_io_config` JSON'ının tutarlı ve öngörülebilir bir yapıya sahip olmasını istiyorum; böylece ESP32 firmware'i ve backend bu yapıyı güvenle işleyebilir.

#### Kabul Kriterleri

1. THE PLC_IO_Form SHALL form gönderildiğinde `plcIoConfig` değeri olarak yalnızca `coils`, `analogChannels` ve `dataRegisters` anahtarlarını içeren bir nesne üretmelidir.
2. THE PLC_IO_Form SHALL üretilen nesne içinde `digitalInputs`, `digitalOutputs`, `analogInputs`, `analogOutputs` veya `dataRegister` anahtarları bulundurmamalıdır.
3. WHEN `coils` dizisindeki her eleman için, THE PLC_IO_Form SHALL `plcTag` (string), `coilAddress` (integer), `tagName` (string) ve `description` (string) alanlarının mevcut olduğunu garantilemelidir.
4. WHEN `analogChannels` dizisindeki her eleman için, THE PLC_IO_Form SHALL `plcTag` (string), `registerAddress` (integer), `length` (integer, minimum 1), `tagName` (string) ve `description` (string) alanlarının mevcut olduğunu garantilemelidir.
5. WHEN `dataRegisters` dizisindeki her eleman için, THE PLC_IO_Form SHALL `plcTag` (string), `registerAddress` (integer), `length` (integer, minimum 1), `tagName` (string) ve `description` (string) alanlarının mevcut olduğunu garantilemelidir.

---

### Gereksinim 6: Eski Veri Uyumluluğu

**Kullanıcı Hikayesi:** Bir sistem yöneticisi olarak, eski formatta kaydedilmiş PLC cihazlarının yeni form açıldığında hata vermemesini istiyorum; böylece geçiş sürecinde veri kaybı yaşanmaz.

#### Kabul Kriterleri

1. WHEN "Cihaz Düzenle" modalı açılırken `plcIoConfig` değeri eski formatı içeriyorsa (örn: `digitalInputs`, `analogInputs` anahtarları), THE PLC_IO_Form SHALL bu değeri `{ coils: [], analogChannels: [], dataRegisters: [] }` olarak yorumlamalı ve boş başlangıç durumunu göstermelidir.
2. IF `plcIoConfig` değeri `null` veya `undefined` ise, THEN THE PLC_IO_Form SHALL `{ coils: [], analogChannels: [], dataRegisters: [] }` ile başlatılmalıdır.
3. IF `plcIoConfig` değeri yeni formatı içeriyorsa (`coils`, `analogChannels`, `dataRegisters` anahtarları), THEN THE PLC_IO_Form SHALL bu değeri doğrudan kullanmalı ve mevcut satırları korumalıdır.
