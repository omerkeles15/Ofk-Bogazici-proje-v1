# Uygulama Planı: SCADA UI Professional

## Genel Bakış

Bu plan, mevcut SCADA UI uygulamasını profesyonel seviyeye taşımak için gerekli tüm kodlama adımlarını içerir. Mevcut React + Vite + TailwindCSS + Zustand altyapısı korunarak yeni paylaşılan bileşenler, hook'lar, JSON şablon üretici, PLC I/O nokta bazlı geçmiş sistemi ve bilgi ekranı eklenir. Her adım bir öncekinin üzerine inşa edilir ve tüm gereksinimler (1-19) ile 36 doğruluk özelliği kapsanır.

## Görevler

- [x] 1. Paylaşılan bileşenler ve hook'lar oluştur
  - [x] 1.1 `src/components/SearchInput.jsx` bileşenini oluştur
    - `value`, `onChange`, `placeholder`, `onClear` prop'larını kabul eden arama kutusu
    - Temizleme (X) butonu ile arama metnini sıfırlama
    - Her tuş vuruşunda `onChange` tetiklenmesi
    - lucide-react `Search` ve `X` ikonları kullanılacak
    - _Gereksinimler: 11.1, 11.2, 11.4, 11.6_

  - [x] 1.2 `src/components/ConfirmDialog.jsx` bileşenini oluştur
    - `title`, `message`, `onConfirm`, `onCancel`, `requirePassword`, `onPasswordVerify` prop'ları
    - `requirePassword=true` ise şifre input alanı göster
    - Yanlış şifre durumunda "Şifre hatalı" mesajı
    - Mevcut `Modal.jsx` bileşenini temel alarak oluştur
    - _Gereksinimler: 9.7, 9.8, 9.9, 16.3_

  - [x] 1.3 `src/components/FormField.jsx` bileşenini oluştur
    - `label`, `error`, `required`, `children` prop'ları
    - Zorunlu alan işareti (*) ve kırmızı hata mesajı gösterimi
    - _Gereksinimler: 16.1, 16.2, 16.3_

  - [x] 1.4 `src/hooks/useSearch.js` hook'unu oluştur
    - `useSearch(items, searchFields, query)` imzası
    - Case-insensitive metin bazlı filtreleme
    - Boş query tüm kayıtları döndürür
    - _Gereksinimler: 11.1, 11.2, 11.3, 11.4_

  - [x] 1.5 `src/hooks/useFormValidation.js` hook'unu oluştur
    - `useFormValidation(rules)` imzası — rules: `{ fieldName: (value) => errorMessage | null }`
    - `errors`, `validate`, `clearErrors`, `isValid` döndürür
    - _Gereksinimler: 16.1, 16.2_


- [x] 2. Checkpoint — Paylaşılan bileşen ve hook'ları doğrula
  - Tüm testlerin geçtiğinden emin ol, sorular varsa kullanıcıya sor.

- [x] 3. JSON şablon üretici ve parse fonksiyonları oluştur
  - [x] 3.1 `src/features/device/generateJsonTemplate.js` dosyasını oluştur
    - `generateDeviceJsonTemplate(device, company, location)` fonksiyonu
    - Sensör cihazları için: deviceId, companyId, locationId, timestamp, type, data (value, unit, status) alanlarını içeren JSON üret
    - PLC cihazları için: I/O yapılandırmasına göre digitalInputs (X adresleri), digitalOutputs (Y adresleri), analogInputs, analogOutputs, dataRegisters alanlarını dinamik üret
    - `getDeltaXAddresses` ve `getDeltaYAddresses` fonksiyonlarını `deviceCatalog.js`'den import et
    - Tüm değerler string formatında olacak
    - I/O yapılandırması değiştiğinde şablon otomatik güncellenecek
    - _Gereksinimler: 18.2, 18.3, 18.4, 18.5, 18.6_

  - [x] 3.2 `src/features/device/parseDeviceData.js` dosyasını oluştur
    - `parseDeviceData(jsonData)` fonksiyonu
    - Dijital I/O: "1" → true (ON), "0" → false (OFF) dönüşümü
    - Analog/register: dataType'a göre parse (word/dword/unsigned/udword → parseInt, float → parseFloat)
    - _Gereksinimler: 18.8, 18.9_

  - [x]* 3.3 Property test: JSON şablon üretici round-trip doğrulaması
    - **Property 15: Delta DVP Oktal Adres Üretimi** — `getDeltaXAddresses(count)` tam olarak `count` adet adres üretmeli, hiçbir adres oktal olmayan rakam içermemeli
    - **Validates: Gereksinimler 7.9, 7.10**

  - [x]* 3.4 Property test: Parse fonksiyonu dataType doğrulaması
    - **Property 14: Modbus Parametre Aralık Doğrulaması** — Slave ID 1-247, Baud Rate izin verilen değerler, Data Bits 7/8, Stop Bits 1/2, Parity none/even/odd
    - **Validates: Gereksinimler 6.2**

- [x] 4. PLC I/O nokta bazlı geçmiş veri sistemi — Store güncellemeleri
  - [x] 4.1 `companyStore.js`'e `ioHistory` state ve aksiyonlarını ekle
    - `ioHistory: {}` başlangıç state'i
    - `appendIOHistory(deviceId, address, record)` — tek nokta geçmiş kaydı ekleme
    - `appendBulkIOHistory(deviceId, dataMap, timestamp)` — toplu I/O geçmiş kaydı ekleme
    - `clearIOHistory(deviceId, address)` — tek nokta geçmişini silme
    - `clearAllIOHistory(deviceId)` — cihazın tüm I/O geçmişini silme
    - Anahtar formatı: `"{deviceId}:{address}"` (ör: "DEV-005:X0")
    - _Gereksinimler: 19.1, 19.7, 19.10_

  - [x] 4.2 `companyStore.js` persist `partialize` fonksiyonuna `ioHistory` ekle
    - Mevcut partialize: `{ companies, deviceHistory }` → `{ companies, deviceHistory, ioHistory }`
    - _Gereksinimler: 14.1, 14.2_

  - [x]* 4.3 Property test: I/O nokta geçmiş kayıt bütünlüğü
    - **Property 34: I/O Nokta Geçmiş Kayıt Bütünlüğü** — `appendIOHistory` çağrıldığında yeni kayıt eklenmeli, mevcut kayıtlar korunmalı
    - **Validates: Gereksinimler 19.1, 19.7**

  - [x]* 4.4 Property test: I/O nokta geçmiş silme izolasyonu
    - **Property 36: I/O Nokta Geçmiş Silme** — `clearIOHistory` çağrıldığında yalnızca o noktanın geçmişi silinmeli, diğerleri etkilenmemeli
    - **Validates: Gereksinimler 19.10**

- [x] 5. Checkpoint — Store güncellemelerini ve JSON fonksiyonlarını doğrula
  - Tüm testlerin geçtiğinden emin ol, sorular varsa kullanıcıya sor.


- [x] 6. Bilgi ekranı (JSON veri formatı modal) oluştur
  - [x] 6.1 `src/components/DeviceJsonInfoModal.jsx` bileşenini oluştur
    - Soru işareti (?) ikonu ile tetiklenen modal pencere
    - `generateDeviceJsonTemplate` fonksiyonunu kullanarak cihaz yapılandırmasına göre dinamik JSON üret
    - JSON'u syntax-highlighted ve okunabilir formatta göster (JSON.stringify ile pretty-print)
    - "JSON'u Kopyala" butonu — `navigator.clipboard.writeText` ile clipboard'a kopyalama
    - Modal başlığında cihaz ID, model ve lokasyon bilgisi
    - lucide-react `HelpCircle` ve `Copy` ikonları
    - _Gereksinimler: 18.1, 18.2, 18.7_

  - [x] 6.2 Cihaz izleme sayfalarına (DeviceHistoryPage, AdminDeviceHistory vb.) soru işareti ikonunu entegre et
    - Sağ üstteki durum etiketinin yanına `HelpCircle` ikonu ekle
    - İkona tıklandığında `DeviceJsonInfoModal` açılsın
    - Cihaz, firma ve lokasyon bilgilerini modal'a prop olarak geçir
    - _Gereksinimler: 18.1, 18.2, 18.5_

- [x] 7. PLC I/O nokta bazlı geçmiş UI bileşenleri oluştur
  - [x] 7.1 `src/components/IOPointHistoryPanel.jsx` bileşenini oluştur
    - Seçilen I/O noktasının geçmiş verilerini tablo formatında göster
    - Tarih sırasına göre azalan sıralama (en yeni en üstte)
    - Her kayıt için: sıra numarası, değer, tarih, saat
    - Dijital noktalar için ON/OFF badge (yeşil/kırmızı)
    - Analog/register noktaları için dataType'a göre parse edilmiş numerik değer
    - Başlangıç/bitiş tarih-saat filtresi
    - Sayfa başına kayıt sayısı seçimi (50, 100, 200)
    - Özet istatistikler: toplam kayıt, filtreli kayıt, gösterilen kayıt
    - Admin için "Tüm Geçmişi Sil" butonu (ConfirmDialog ile şifre doğrulaması)
    - _Gereksinimler: 19.2, 19.3, 19.4, 19.5, 19.6, 19.8, 19.9, 19.10_

  - [x] 7.2 PLC izleme sayfasına I/O nokta tıklama ve geçmiş panel entegrasyonu yap
    - PLC cihaz detay sayfasında her I/O noktasına (X, Y, AI, AO, D) tıklanabilirlik ekle
    - Tıklanan noktanın geçmiş panelini aç (IOPointHistoryPanel)
    - Dijital noktalar: ON/OFF (yeşil/kırmızı) mevcut değer gösterimi
    - Analog/register noktalar: numerik mevcut değer gösterimi
    - Tag ismi varsa adresin yanında göster
    - _Gereksinimler: 19.2, 19.3_

  - [x]* 7.3 Property test: I/O nokta geçmiş tarih filtresi
    - **Property 35: I/O Nokta Geçmiş Tarih Filtresi** — filtreleme sonrası tüm kayıtların timestamp değeri belirtilen aralık içinde olmalı
    - **Validates: Gereksinimler 19.5**

- [x] 8. Checkpoint — Bilgi ekranı ve I/O geçmiş UI'ını doğrula
  - Tüm testlerin geçtiğinden emin ol, sorular varsa kullanıcıya sor.


- [x] 9. Mevcut sayfalara SearchInput ve useSearch entegrasyonu
  - [x] 9.1 `AdminDevices.jsx` sayfasına arama entegrasyonu yap
    - `SearchInput` bileşenini cihaz listesi üstüne ekle
    - `useSearch` hook'u ile Device ID, tag name, firma adı, lokasyon adı alanlarında filtreleme
    - Sonuç boşsa "Cihaz bulunamadı" mesajı göster
    - _Gereksinimler: 11.1, 11.4, 11.5_

  - [x] 9.2 `AdminUsers.jsx` sayfasına arama entegrasyonu yap
    - `SearchInput` bileşenini kullanıcı listesi üstüne ekle
    - `useSearch` hook'u ile ad, kullanıcı adı, rol alanlarında filtreleme
    - Sonuç boşsa "Kullanıcı bulunamadı" mesajı göster
    - _Gereksinimler: 11.2, 11.4, 11.5_

  - [x]* 9.3 Property test: Arama/filtreleme doğruluğu
    - **Property 29: Arama/Filtreleme Doğruluğu** — boş arama tüm kayıtları döndürmeli, boş olmayan arama ile dönen her kayıt arama metnini (case-insensitive) içermeli
    - **Validates: Gereksinimler 11.1, 11.2, 11.3**

- [x] 10. Mevcut sayfalara FormField ve useFormValidation entegrasyonu
  - [x] 10.1 Firma ekleme/düzenleme formlarına `FormField` ve `useFormValidation` entegre et
    - `AdminCompanies.jsx` ve `AdminCompanyDetail.jsx` formlarında zorunlu alan doğrulaması
    - displayName ve fullName boş bırakılamaz kuralı
    - Hata mesajları form alanı altında kırmızı renkte
    - _Gereksinimler: 3.5, 16.1_

  - [x] 10.2 Kullanıcı ekleme formuna `FormField` ve `useFormValidation` entegre et
    - `AdminUsers.jsx` formunda zorunlu alan ve benzersizlik doğrulaması
    - Kullanıcı adı çakışması kontrolü
    - _Gereksinimler: 10.2, 16.1, 16.2_

  - [x]* 10.3 Property test: Zorunlu alan doğrulama
    - **Property 9: Zorunlu Alan Doğrulama** — boş string veya whitespace ile ekleme/düzenleme reddedilmeli, state değişmemeli
    - **Validates: Gereksinimler 3.5, 4.5, 16.1**

  - [x]* 10.4 Property test: Kullanıcı adı benzersizlik kontrolü
    - **Property 26: Kullanıcı Adı Benzersizlik Kontrolü** — mevcut kullanıcı adı ile ekleme reddedilmeli, hata mesajı dönmeli
    - **Validates: Gereksinimler 10.2, 16.2**

- [x] 11. Checkpoint — Arama, filtreleme ve form doğrulama entegrasyonlarını doğrula
  - Tüm testlerin geçtiğinden emin ol, sorular varsa kullanıcıya sor.


- [x] 12. Store property-based testleri — Auth ve RBAC
  - [x]* 12.1 Property test: Login/Logout round-trip
    - **Property 1: Login/Logout Round-Trip** — geçerli kullanıcı ile login → isAuthenticated: true + rol bazlı yönlendirme yolu, logout → isAuthenticated: false, user: null, token: null
    - **Validates: Gereksinimler 1.1, 1.3**

  - [x]* 12.2 Property test: Geçersiz kimlik bilgileri reddi
    - **Property 2: Geçersiz Kimlik Bilgileri Reddi** — geçersiz kullanıcı/şifre çifti ile login hata fırlatmalı, state değişmemeli
    - **Validates: Gereksinimler 1.2**

  - [x]* 12.3 Property test: Oturum nesnesinde şifre bulunmaması
    - **Property 3: Oturum Nesnesinde Şifre Bulunmaması** — başarılı login sonrası user nesnesinde password alanı bulunmamalı
    - **Validates: Gereksinimler 1.4**

  - [x]* 12.4 Property test: Rol bazlı erişim kontrolü
    - **Property 4: Rol Bazlı Erişim Kontrolü** — kullanıcı rolü rotanın allowedRoles listesinde yoksa erişim reddedilmeli
    - **Validates: Gereksinimler 2.2, 2.3**

  - [x]* 12.5 Property test: Rol bazlı veri kapsamı
    - **Property 5: Rol Bazlı Veri Kapsamı** — company_manager yalnızca kendi firmasına, location_manager/user yalnızca kendi lokasyonuna erişebilmeli
    - **Validates: Gereksinimler 2.5, 2.6, 2.7, 12.3, 12.4**

- [x] 13. Store property-based testleri — Company/Location/Device CRUD
  - [x]* 13.1 Property test: Entity ekleme benzersiz ID garantisi
    - **Property 6: Entity Ekleme Benzersiz ID Garantisi** — eklenen entity ID'si mevcut tüm ID'lerden farklı olmalı, cihaz ID formatı DEV-XXX
    - **Validates: Gereksinimler 3.2, 4.1, 5.2**

  - [x]* 13.2 Property test: Kaskad silme bütünlüğü
    - **Property 7: Kaskad Silme Bütünlüğü** — firma silindiğinde bağlı lokasyonlar ve cihazlar da kaldırılmalı
    - **Validates: Gereksinimler 3.4, 4.3**

  - [x]* 13.3 Property test: CRUD güncelleme yansıması
    - **Property 8: CRUD Güncelleme Yansıması** — güncellenen alanlar yeni değerleri ile bulunmalı, güncellenmemiş alanlar değişmemeli
    - **Validates: Gereksinimler 3.3, 4.2, 5.6**

  - [x]* 13.4 Property test: Firma istatistik hesaplama doğruluğu
    - **Property 10: Firma İstatistik Hesaplama Doğruluğu** — lokasyon sayısı locations.length, cihaz sayısı locations.flatMap(l => l.devices).length
    - **Validates: Gereksinimler 3.6, 12.1, 12.2**

  - [x]* 13.5 Property test: Cihaz silme sonrası kaldırılma
    - **Property 13: Cihaz Silme Sonrası Kaldırılma** — silinen cihaz ID'si state'te bulunmamalı
    - **Validates: Gereksinimler 5.7**

  - [x]* 13.6 Property test: Cihaz durum toggle ve zaman damgası
    - **Property 12: Cihaz Durum Toggle ve Zaman Damgası** — toggle sonrası durum tersine dönmeli, timestamp güncellenmeli
    - **Validates: Gereksinimler 5.8, 5.9**


- [x] 14. Store property-based testleri — Cihaz kataloğu ve yapılandırma
  - [x]* 14.1 Property test: Cihaz tipi birim otomatik atanması
    - **Property 11: Cihaz Tipi Birim Otomatik Atanması** — sensör alt tipi seçildiğinde birim katalogdaki unit değerine eşit olmalı, tip değiştiğinde alanlar sıfırlanmalı
    - **Validates: Gereksinimler 5.5, 17.3, 17.4**

  - [x]* 14.2 Property test: Analog kanal dinamik ekleme/silme
    - **Property 16: Analog Kanal Dinamik Ekleme/Silme** — kanal eklendiğinde sayı 1 artmalı, silindiğinde 1 azalmalı, kanal numaraları benzersiz olmalı
    - **Validates: Gereksinimler 7.4, 7.5**

  - [x]* 14.3 Property test: Data register aralık geçerliliği
    - **Property 17: Data Register Aralık Geçerliliği** — start <= end olmalı
    - **Validates: Gereksinimler 7.7**

- [x] 15. Checkpoint — Store property testlerini doğrula
  - Tüm testlerin geçtiğinden emin ol, sorular varsa kullanıcıya sor.


- [x] 16. Property-based testler — Tag yönetimi ve geçmiş veri
  - [x]* 16.1 Property test: Tag ismi kaydetme round-trip
    - **Property 18: Tag İsmi Kaydetme Round-Trip** — tag ismi atanıp kaydedildikten sonra cihaz verisindeki tags map'inde aynı adres için aynı isim bulunmalı
    - **Validates: Gereksinimler 8.3**

  - [x]* 16.2 Property test: Toplu tag temizleme
    - **Property 19: Toplu Tag Temizleme** — I/O grubu temizleme sonrası o gruptaki tüm tag isimleri boş string olmalı
    - **Validates: Gereksinimler 8.5**

  - [x]* 16.3 Property test: Admin olmayan kullanıcılar için tag salt okunur
    - **Property 20: Admin Olmayan Kullanıcılar İçin Tag Salt Okunur** — admin olmayan kullanıcılar için tag alanları düzenlenemez olmalı
    - **Validates: Gereksinimler 8.2**

  - [x]* 16.4 Property test: Geçmiş veri tarih sıralaması
    - **Property 21: Geçmiş Veri Tarih Sıralaması** — kayıtlar tarih damgasına göre azalan sırada sıralanmalı
    - **Validates: Gereksinimler 9.1**

  - [x]* 16.5 Property test: Geçmiş veri tarih filtresi
    - **Property 22: Geçmiş Veri Tarih Filtresi** — filtreleme sonrası tüm kayıtların timestamp değeri belirtilen aralık içinde olmalı
    - **Validates: Gereksinimler 9.3**

  - [x]* 16.6 Property test: Geçmiş veri sayfalama
    - **Property 23: Geçmiş Veri Sayfalama** — gösterilen kayıt sayısı seçilen limitten büyük olmamalı
    - **Validates: Gereksinimler 9.4**


  - [x]* 16.7 Property test: Geçmiş veri istatistik tutarlılığı
    - **Property 24: Geçmiş Veri İstatistik Tutarlılığı** — toplam kayıt sayısı, filtreli kayıt sayısı ve gösterilen kayıt sayısı doğru hesaplanmalı
    - **Validates: Gereksinimler 9.5**

  - [x]* 16.8 Property test: Geçmiş silme şifre doğrulaması
    - **Property 25: Geçmiş Silme Şifre Doğrulaması** — yanlış şifre ile silme gerçekleşmemeli, doğru şifre ile veriler silinmeli
    - **Validates: Gereksinimler 9.7, 9.9**

- [x] 17. Property-based testler — Kullanıcı yönetimi ve UI
  - [x]* 17.1 Property test: Kullanıcı ağaç yapısı gruplama
    - **Property 27: Kullanıcı Ağaç Yapısı Gruplama** — her firma altında yalnızca o firmaya atanmış kullanıcılar, firmaya atanmamışlar ayrı bölümde
    - **Validates: Gereksinimler 10.3, 10.4, 10.5**

  - [x]* 17.2 Property test: Firma seçimine göre lokasyon filtreleme
    - **Property 28: Firma Seçimine Göre Lokasyon Filtreleme** — lokasyon dropdown'ındaki tüm lokasyonlar yalnızca seçilen firmaya ait olmalı
    - **Validates: Gereksinimler 10.8**

  - [x]* 17.3 Property test: Sensör kartı bilgi bütünlüğü
    - **Property 30: Sensör Kartı Bilgi Bütünlüğü** — kart bileşeni tag name, değer, birim, Device ID, durum ve son güncelleme içermeli
    - **Validates: Gereksinimler 13.1**

  - [x]* 17.4 Property test: Sensör kartı rol bazlı yönlendirme
    - **Property 31: Sensör Kartı Rol Bazlı Yönlendirme** — "İzle" butonu /{rolPrefix}/device/{deviceId} formatında yönlendirme yapmalı
    - **Validates: Gereksinimler 13.3**

  - [x]* 17.5 Property test: State persist round-trip
    - **Property 32: State Persist Round-Trip** — localStorage'a yazılan veri aynı yapıda geri okunmalı
    - **Validates: Gereksinimler 14.5**

  - [x]* 17.6 Property test: Rol bazlı menü öğeleri
    - **Property 33: Rol Bazlı Menü Öğeleri** — sidebar menü öğeleri yalnızca rolün erişim yetkisi olan sayfalara ait olmalı
    - **Validates: Gereksinimler 15.6**


- [x] 18. Birim testleri — Cihaz kataloğu ve sabit tanımlar
  - [x]* 18.1 Cihaz kataloğu birim testleri yaz
    - 12 sensör alt tipi tanımının doğruluğu (value, label, unit eşleşmeleri)
    - 8 PLC Delta DVP model tanımının doğruluğu
    - `getUnit()` fonksiyonunun doğru birim döndürmesi
    - `getSubtypes()` fonksiyonunun doğru alt tip listesi döndürmesi
    - Modbus varsayılan değerleri: slaveId=1, baudRate=9600, dataBits=8, stopBits=1, parity=none
    - I/O varsayılan değerleri: 8 dijital giriş, 6 dijital çıkış, 2 analog giriş, 1 analog çıkış, D0-D100
    - _Gereksinimler: 17.1, 17.2, 6.3, 7.8_

  - [x]* 18.2 Delta DVP adres üretimi edge case testleri yaz
    - `getDeltaXAddresses(0)` → boş dizi
    - `getDeltaXAddresses(8)` → X0-X7
    - `getDeltaXAddresses(16)` → X0-X7, X20-X27
    - `getDeltaYAddresses(0)` → boş dizi
    - `getDeltaYAddresses(6)` → Y0-Y5
    - `getDeltaYAddresses(14)` → Y0-Y5, Y20-Y27
    - _Gereksinimler: 7.9, 7.10_

  - [x]* 18.3 JSON şablon üretici birim testleri yaz
    - Sensör cihazı için doğru JSON yapısı (deviceId, type, data.value, data.unit, data.status)
    - PLC cihazı için I/O yapılandırmasına uygun dinamik JSON yapısı
    - I/O yapılandırması değiştiğinde JSON'un güncellenmesi
    - _Gereksinimler: 18.3, 18.4, 18.5_

  - [x]* 18.4 Parse fonksiyonu birim testleri yaz
    - Dijital I/O: "1" → true, "0" → false
    - Analog word: "1024" → 1024 (parseInt)
    - Analog float: "3.14" → 3.14 (parseFloat)
    - Boş/eksik veri durumları
    - _Gereksinimler: 18.8, 18.9_

- [x] 19. Checkpoint — Tüm birim ve property testlerini doğrula
  - Tüm testlerin geçtiğinden emin ol, sorular varsa kullanıcıya sor.


- [x] 20. Tüm bileşenleri entegre et ve uçtan uca bağlantıları kur
  - [x] 20.1 Tüm yeni bileşen ve hook importlarını ilgili sayfalara bağla
    - SearchInput → AdminDevices, AdminUsers
    - FormField + useFormValidation → AdminCompanies, AdminCompanyDetail, AdminUsers
    - ConfirmDialog → DeviceHistoryPage, IOPointHistoryPanel
    - DeviceJsonInfoModal → tüm DeviceHistory sayfaları
    - IOPointHistoryPanel → PLC cihaz detay sayfaları
    - _Gereksinimler: 11.1, 16.1, 18.1, 19.3_

  - [x] 20.2 PLC cihaz detay sayfasında I/O geçmiş akışını tamamla
    - I/O noktasına tıklama → IOPointHistoryPanel açılması
    - ioHistory store'dan veri çekme
    - Filtre ve sayfalama işlevselliği
    - Admin silme butonu + ConfirmDialog entegrasyonu
    - _Gereksinimler: 19.2, 19.3, 19.5, 19.6, 19.10_

- [x] 21. Son checkpoint — Tüm testlerin geçtiğini doğrula
  - Tüm testlerin geçtiğinden emin ol, sorular varsa kullanıcıya sor.


## Notlar

- `*` ile işaretli görevler opsiyoneldir ve daha hızlı MVP için atlanabilir
- Her görev belirli gereksinimlere referans verir (izlenebilirlik)
- Checkpoint'ler artımlı doğrulama sağlar
- Property testleri evrensel doğruluk özelliklerini doğrular (fast-check ile min 100 iterasyon)
- Birim testleri belirli örnekleri ve edge case'leri doğrular (Vitest)
- Test dosyaları `src/__tests__/` altında organize edilir
- Mevcut bileşenler korunur, yalnızca yeni bileşenler eklenir ve entegrasyon yapılır
