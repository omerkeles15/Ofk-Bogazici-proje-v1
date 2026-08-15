# Gereksinimler Belgesi

## Giriş

Bu belge, mevcut SCADA UI projesinin profesyonel seviyeye taşınması için gerekli gereksinimleri tanımlar. Proje; React + Vite + TailwindCSS + Zustand teknoloji yığını üzerine kurulu, çok kiracılı (multi-tenant) bir SCADA dashboard uygulamasıdır. Mevcut yapıda Firma → Lokasyon → Cihaz hiyerarşisi, RBAC tabanlı yetkilendirme, Sensör ve PLC (Delta DVP serisi) cihaz yönetimi, Modbus yapılandırma, I/O konfigürasyonu ve tag isimlendirme sistemi bulunmaktadır. Bu gereksinimler, mevcut işlevselliğin güçlendirilmesi ve eksik kalan alanların tamamlanmasını kapsar.

## Sözlük

- **Sistem**: SCADA UI uygulamasının tamamı (frontend + state yönetimi)
- **RBAC_Modülü**: Rol tabanlı erişim kontrolü modülü (Admin, Firma_Yöneticisi, Lokasyon_Yöneticisi, Kullanıcı rolleri)
- **Kimlik_Doğrulama_Modülü**: Kullanıcı giriş/çıkış ve oturum yönetimi modülü
- **Firma_Yönetim_Modülü**: Firma CRUD işlemlerini yöneten modül
- **Lokasyon_Yönetim_Modülü**: Lokasyon CRUD işlemlerini yöneten modül
- **Cihaz_Yönetim_Modülü**: Sensör ve PLC cihazlarının ekleme, düzenleme, silme ve durum yönetimi modülü
- **Modbus_Yapılandırma_Modülü**: PLC cihazları için Modbus RTU iletişim parametrelerini yöneten modül
- **IO_Yapılandırma_Modülü**: PLC cihazları için dijital/analog giriş-çıkış ve data register yapılandırma modülü
- **Tag_Yönetim_Modülü**: PLC I/O noktalarına anlamlı isimler atanmasını yöneten modül
- **Geçmiş_Veri_Modülü**: Cihaz ölçüm geçmişinin kaydedilmesi, filtrelenmesi ve silinmesi modülü
- **Kullanıcı_Yönetim_Modülü**: Kullanıcı CRUD işlemlerini ve rol/firma/lokasyon atamalarını yöneten modül
- **Arama_Filtreleme_Modülü**: Tablo ve liste görünümlerinde arama ve filtreleme işlevlerini sağlayan modül
- **Veri_Kalıcılık_Katmanı**: Zustand persist middleware ile localStorage üzerinde veri saklama katmanı
- **Dashboard_Modülü**: Rol bazlı özet istatistik ve genel bakış ekranlarını sunan modül
- **Layout_Modülü**: Sidebar, Navbar ve responsive sayfa düzenini yöneten modül
- **Firma_Yöneticisi**: company_manager rolüne sahip kullanıcı
- **Lokasyon_Yöneticisi**: location_manager rolüne sahip kullanıcı
- **PLC**: Programlanabilir Lojik Kontrolör (Delta DVP serisi)
- **Modbus_RTU**: Seri haberleşme protokolü
- **Tag**: PLC I/O noktasına atanan anlamlı tanımlayıcı isim

## Gereksinimler

### Gereksinim 1: Kimlik Doğrulama ve Oturum Yönetimi

**Kullanıcı Hikayesi:** Bir kullanıcı olarak, güvenli bir şekilde sisteme giriş yapmak ve oturumumu yönetmek istiyorum, böylece yetkisiz erişim engellensin.

#### Kabul Kriterleri

1. WHEN bir kullanıcı geçerli kullanıcı adı ve şifre ile giriş yapar, THE Kimlik_Doğrulama_Modülü SHALL kullanıcıyı doğrulayarak rolüne uygun dashboard sayfasına yönlendirme yapacaktır
2. WHEN bir kullanıcı geçersiz kullanıcı adı veya şifre ile giriş yapar, THE Kimlik_Doğrulama_Modülü SHALL "Kullanıcı adı veya şifre hatalı" hata mesajını görüntüleyecektir
3. WHEN bir kullanıcı çıkış yapar, THE Kimlik_Doğrulama_Modülü SHALL oturum bilgilerini temizleyerek giriş sayfasına yönlendirme yapacaktır
4. THE Kimlik_Doğrulama_Modülü SHALL kullanıcı şifrelerini state içinde düz metin olarak saklamayacak, şifre bilgisini oturum nesnesinden çıkaracaktır
5. WHILE bir kullanıcı oturum açmış durumdayken, THE Kimlik_Doğrulama_Modülü SHALL oturum bilgilerini localStorage üzerinde persist edecektir
6. IF localStorage'daki oturum verisi bozulursa, THEN THE Kimlik_Doğrulama_Modülü SHALL kullanıcıyı giriş sayfasına yönlendirecektir

### Gereksinim 2: Rol Tabanlı Erişim Kontrolü (RBAC)

**Kullanıcı Hikayesi:** Bir sistem yöneticisi olarak, kullanıcıların yalnızca yetkili oldukları sayfalara ve işlemlere erişmesini istiyorum, böylece veri güvenliği sağlansın.

#### Kabul Kriterleri

1. THE RBAC_Modülü SHALL dört rol tanımlayacaktır: admin, company_manager, location_manager, user
2. WHEN oturum açmamış bir kullanıcı korumalı bir sayfaya erişmeye çalışır, THE RBAC_Modülü SHALL kullanıcıyı giriş sayfasına yönlendirecektir
3. WHEN oturum açmış bir kullanıcı yetkisi olmayan bir sayfaya erişmeye çalışır, THE RBAC_Modülü SHALL kullanıcıyı "Yetkisiz Erişim" sayfasına yönlendirecektir
4. WHILE admin rolündeki bir kullanıcı oturum açmışken, THE RBAC_Modülü SHALL tüm firma, lokasyon, cihaz ve kullanıcı yönetim sayfalarına erişim izni verecektir
5. WHILE company_manager rolündeki bir kullanıcı oturum açmışken, THE RBAC_Modülü SHALL yalnızca atandığı firmaya ait dashboard ve cihaz geçmişi sayfalarına erişim izni verecektir
6. WHILE location_manager rolündeki bir kullanıcı oturum açmışken, THE RBAC_Modülü SHALL yalnızca atandığı lokasyona ait dashboard ve cihaz geçmişi sayfalarına erişim izni verecektir
7. WHILE user rolündeki bir kullanıcı oturum açmışken, THE RBAC_Modülü SHALL yalnızca atandığı lokasyona ait dashboard ve cihaz geçmişi sayfalarına salt okunur erişim izni verecektir

### Gereksinim 3: Firma Yönetimi

**Kullanıcı Hikayesi:** Bir admin olarak, firmaları eklemek, düzenlemek ve silmek istiyorum, böylece çok kiracılı yapıyı yönetebilmeliyim.

#### Kabul Kriterleri

1. THE Firma_Yönetim_Modülü SHALL her firma için görünen ad (displayName) ve tam ad (fullName) alanlarını zorunlu olarak saklayacaktır
2. WHEN admin yeni bir firma ekler, THE Firma_Yönetim_Modülü SHALL firmaya benzersiz bir ID atayarak firmalar listesine ekleyecektir
3. WHEN admin bir firmanın bilgilerini düzenler, THE Firma_Yönetim_Modülü SHALL güncellenen bilgileri anında listeye yansıtacaktır
4. WHEN admin bir firmayı siler, THE Firma_Yönetim_Modülü SHALL firmayı ve firmaya bağlı tüm lokasyonları listeden kaldıracaktır
5. IF firma eklerken görünen ad veya tam ad alanı boş bırakılırsa, THEN THE Firma_Yönetim_Modülü SHALL "Tüm alanları doldurun" hata mesajını görüntüleyecektir
6. THE Firma_Yönetim_Modülü SHALL firmalar listesinde her firma için lokasyon sayısı ve cihaz sayısını görüntüleyecektir

### Gereksinim 4: Lokasyon Yönetimi

**Kullanıcı Hikayesi:** Bir admin olarak, firmalara bağlı lokasyonları yönetmek istiyorum, böylece fiziksel tesisleri organize edebilmeliyim.

#### Kabul Kriterleri

1. WHEN admin bir firmaya yeni lokasyon ekler, THE Lokasyon_Yönetim_Modülü SHALL lokasyona benzersiz bir ID atayarak firma detay sayfasında görüntüleyecektir
2. WHEN admin bir lokasyonun adını düzenler, THE Lokasyon_Yönetim_Modülü SHALL güncellenen adı anında yansıtacaktır
3. WHEN admin bir lokasyonu siler, THE Lokasyon_Yönetim_Modülü SHALL lokasyonu ve lokasyona bağlı tüm cihazları kaldıracaktır
4. THE Lokasyon_Yönetim_Modülü SHALL her lokasyon kartında o lokasyona ait cihazları tablo formatında görüntüleyecektir
5. IF lokasyon adı boş bırakılırsa, THEN THE Lokasyon_Yönetim_Modülü SHALL lokasyon ekleme veya düzenleme işlemini gerçekleştirmeyecektir

### Gereksinim 5: Cihaz Yönetimi (Sensör ve PLC)

**Kullanıcı Hikayesi:** Bir admin olarak, lokasyonlara sensör ve PLC cihazları eklemek, düzenlemek ve silmek istiyorum, böylece saha ekipmanlarını dijital ortamda yönetebilmeliyim.

#### Kabul Kriterleri

1. THE Cihaz_Yönetim_Modülü SHALL iki ana cihaz tipi destekleyecektir: Sensör ve PLC
2. WHEN admin yeni bir cihaz ekler, THE Cihaz_Yönetim_Modülü SHALL otomatik olarak sıralı bir Device ID (DEV-001, DEV-002, ...) atayacaktır
3. WHEN admin cihaz tipi olarak "Sensör" seçer, THE Cihaz_Yönetim_Modülü SHALL sensör alt tiplerini (Sıcaklık, Basınç, Nem, Titreşim, Akış, Seviye, Voltaj, Akım, Güç, CO₂, Duman, Yakınlık) listeleyecektir
4. WHEN admin cihaz tipi olarak "PLC" seçer, THE Cihaz_Yönetim_Modülü SHALL Delta DVP model seçeneklerini (ES2, EX2, SS2, SA2, SX2, EH3, EH2, PM) listeleyecektir
5. WHEN admin bir sensör alt tipi seçer, THE Cihaz_Yönetim_Modülü SHALL birim bilgisini katalogdan otomatik olarak atayacaktır
6. WHEN admin bir cihazı düzenler, THE Cihaz_Yönetim_Modülü SHALL tag name, cihaz tipi, alt tip ve birim bilgilerinin güncellenmesine izin verecektir
7. WHEN admin bir cihazı siler, THE Cihaz_Yönetim_Modülü SHALL cihazı lokasyondan kaldıracaktır
8. THE Cihaz_Yönetim_Modülü SHALL her cihaz için aktif/pasif durum toggle kontrolü sağlayacaktır
9. WHEN cihaz durumu değiştirilir, THE Cihaz_Yönetim_Modülü SHALL zaman damgasını güncelleyecektir
10. THE Cihaz_Yönetim_Modülü SHALL tüm cihazları firma ve lokasyon bilgileriyle birlikte merkezi bir listede görüntüleyecektir

### Gereksinim 6: PLC Modbus Yapılandırması

**Kullanıcı Hikayesi:** Bir admin olarak, PLC cihazları için Modbus RTU iletişim parametrelerini yapılandırmak istiyorum, böylece PLC ile doğru haberleşme kurulabilsin.

#### Kabul Kriterleri

1. WHEN admin bir PLC cihazı ekler veya düzenler, THE Modbus_Yapılandırma_Modülü SHALL Modbus yapılandırma formunu görüntüleyecektir
2. THE Modbus_Yapılandırma_Modülü SHALL şu parametreleri yapılandırılabilir olarak sunacaktır: Slave ID (1-247), Baud Rate (1200-115200), Data Bits (7-8), Stop Bits (1-2), Parity (None/Even/Odd)
3. THE Modbus_Yapılandırma_Modülü SHALL varsayılan değerleri atayacaktır: Slave ID=1, Baud Rate=9600, Data Bits=8, Stop Bits=1, Parity=None
4. WHEN bir PLC cihazının detay sayfası görüntülenir, THE Modbus_Yapılandırma_Modülü SHALL mevcut Modbus yapılandırmasını salt okunur formatta gösterecektir
5. WHEN admin cihaz listesinde bir PLC cihazının Modbus ikonuna tıklar, THE Modbus_Yapılandırma_Modülü SHALL Modbus yapılandırma bilgilerini modal pencerede görüntüleyecektir

### Gereksinim 7: PLC I/O Yapılandırması

**Kullanıcı Hikayesi:** Bir admin olarak, PLC cihazlarının dijital/analog giriş-çıkış ve data register yapılandırmasını yapmak istiyorum, böylece PLC I/O haritası doğru şekilde tanımlansın.

#### Kabul Kriterleri

1. WHEN admin bir PLC cihazı ekler veya düzenler, THE IO_Yapılandırma_Modülü SHALL I/O yapılandırma formunu görüntüleyecektir
2. THE IO_Yapılandırma_Modülü SHALL dijital giriş (X) sayısını yapılandırılabilir olarak sunacaktır (0, 8, 16, 24, 32, 40, 48, 64 seçenekleri)
3. THE IO_Yapılandırma_Modülü SHALL dijital çıkış (Y) sayısını yapılandırılabilir olarak sunacaktır (0, 6, 14, 22, 30, 38, 46, 54 seçenekleri)
4. THE IO_Yapılandırma_Modülü SHALL analog giriş (AI) kanallarını dinamik olarak ekleme ve silme imkanı sunacaktır
5. THE IO_Yapılandırma_Modülü SHALL analog çıkış (AO) kanallarını dinamik olarak ekleme ve silme imkanı sunacaktır
6. THE IO_Yapılandırma_Modülü SHALL her analog kanal için veri tipi seçimi sunacaktır: Word (INT16), Double Word (INT32), Unsigned Word (UINT16), Unsigned DWord (UINT32), Float (Real)
7. THE IO_Yapılandırma_Modülü SHALL data register (D) aralığı için başlangıç adresi, bitiş adresi ve veri tipi yapılandırması sunacaktır
8. THE IO_Yapılandırma_Modülü SHALL varsayılan değerleri atayacaktır: 8 dijital giriş, 6 dijital çıkış, 2 analog giriş, 1 analog çıkış, D0-D100 register aralığı
9. THE IO_Yapılandırma_Modülü SHALL Delta DVP X adreslerini oktal gruplama kuralına göre üretecektir (X0-X7, X20-X27, X30-X37, ...)
10. THE IO_Yapılandırma_Modülü SHALL Delta DVP Y adreslerini oktal gruplama kuralına göre üretecektir (Y0-Y5, Y20-Y27, Y30-Y37, ...)

### Gereksinim 8: Tag İsimlendirme Sistemi

**Kullanıcı Hikayesi:** Bir admin olarak, PLC I/O noktalarına anlamlı tag isimleri atamak istiyorum, böylece operatörler hangi noktanın ne işe yaradığını kolayca anlayabilsin.

#### Kabul Kriterleri

1. WHILE admin bir PLC cihazının detay sayfasını görüntülerken, THE Tag_Yönetim_Modülü SHALL her I/O noktası (X, Y, AI, AO, D) için düzenlenebilir tag ismi alanı sunacaktır
2. WHILE admin olmayan bir kullanıcı PLC detay sayfasını görüntülerken, THE Tag_Yönetim_Modülü SHALL tag isimlerini salt okunur formatta gösterecektir
3. WHEN admin tag isimlerini düzenler ve "Tag İsimlerini Kaydet" butonuna tıklar, THE Tag_Yönetim_Modülü SHALL tüm tag isimlerini cihaz verisine kaydedecektir
4. WHEN admin kaydedilmemiş tag değişiklikleri varken sayfadan ayrılmaya çalışır, THE Tag_Yönetim_Modülü SHALL uyarı mesajı gösterecektir
5. THE Tag_Yönetim_Modülü SHALL her I/O grubu (X, Y, AI, AO, D) için toplu tag temizleme işlevi sunacaktır
6. WHEN tag isimleri kaydedilir, THE Tag_Yönetim_Modülü SHALL 2.5 saniye süreyle "Tag İsimleri Kaydedildi" onay mesajı gösterecektir

### Gereksinim 9: Cihaz Geçmiş Veri Yönetimi

**Kullanıcı Hikayesi:** Bir kullanıcı olarak, sensör cihazlarının geçmiş ölçüm verilerini görüntülemek ve filtrelemek istiyorum, böylece zaman bazlı analiz yapabilmeliyim.

#### Kabul Kriterleri

1. WHEN bir sensör cihazının detay sayfası açılır, THE Geçmiş_Veri_Modülü SHALL cihaza ait geçmiş kayıtları tarih sırasına göre (en yeni en üstte) tablo formatında görüntüleyecektir
2. THE Geçmiş_Veri_Modülü SHALL her kayıt için sıra numarası, değer, birim, tarih ve saat bilgilerini görüntüleyecektir
3. THE Geçmiş_Veri_Modülü SHALL başlangıç ve bitiş tarih/saat filtresi sunacaktır
4. THE Geçmiş_Veri_Modülü SHALL sayfa başına gösterilecek kayıt sayısı seçimi sunacaktır (50, 100, 200 seçenekleri)
5. THE Geçmiş_Veri_Modülü SHALL özet istatistikleri görüntüleyecektir: son değer, toplam kayıt sayısı, filtreli kayıt sayısı, gösterilen kayıt sayısı
6. WHILE admin rolündeki bir kullanıcı geçmiş veri sayfasını görüntülerken, THE Geçmiş_Veri_Modülü SHALL "Tüm Geçmişi Sil" ve "Seçili Aralığı Sil" butonlarını görüntüleyecektir
7. WHEN admin geçmiş veri silme işlemi başlatır, THE Geçmiş_Veri_Modülü SHALL admin şifresi doğrulaması isteyecektir
8. IF admin yanlış şifre girerse, THEN THE Geçmiş_Veri_Modülü SHALL "Şifre hatalı" mesajı gösterecektir
9. WHEN admin doğru şifre ile silme işlemini onaylar, THE Geçmiş_Veri_Modülü SHALL seçilen verileri kalıcı olarak silecektir
10. WHEN bir PLC cihazının detay sayfası açılır, THE Geçmiş_Veri_Modülü SHALL sensör geçmişi yerine PLC I/O yapılandırma ve tag görünümünü gösterecektir

### Gereksinim 10: Kullanıcı Yönetimi

**Kullanıcı Hikayesi:** Bir admin olarak, kullanıcıları eklemek, düzenlemek ve silmek istiyorum, böylece sisteme erişimi kontrol edebilmeliyim.

#### Kabul Kriterleri

1. WHEN admin yeni bir kullanıcı ekler, THE Kullanıcı_Yönetim_Modülü SHALL ad soyad, kullanıcı adı, şifre, rol, firma ve lokasyon bilgilerini form aracılığıyla alacaktır
2. IF eklenmek istenen kullanıcı adı zaten mevcutsa, THEN THE Kullanıcı_Yönetim_Modülü SHALL "kullanıcı adı zaten alınmış" hata mesajını görüntüleyecektir
3. THE Kullanıcı_Yönetim_Modülü SHALL kullanıcıları firma bazlı ağaç yapısında (tree-view) görüntüleyecektir
4. THE Kullanıcı_Yönetim_Modülü SHALL her firma ağacında firma yöneticilerini ve lokasyon bazlı kullanıcıları gruplandırarak gösterecektir
5. THE Kullanıcı_Yönetim_Modülü SHALL firmaya atanmamış kullanıcıları ayrı bir bölümde görüntüleyecektir
6. WHEN admin bir kullanıcıyı siler, THE Kullanıcı_Yönetim_Modülü SHALL kullanıcıyı listeden kaldıracaktır
7. THE Kullanıcı_Yönetim_Modülü SHALL her kullanıcı için rol bilgisini renkli etiket (badge) olarak görüntüleyecektir
8. WHEN admin firma seçimi yapar, THE Kullanıcı_Yönetim_Modülü SHALL seçilen firmaya ait lokasyonları lokasyon dropdown listesinde dinamik olarak yükleyecektir

### Gereksinim 11: Arama ve Filtreleme

**Kullanıcı Hikayesi:** Bir kullanıcı olarak, cihaz ve kullanıcı listelerinde hızlıca arama yapmak istiyorum, böylece aradığım kaydı kolayca bulabilmeliyim.

#### Kabul Kriterleri

1. THE Arama_Filtreleme_Modülü SHALL cihaz listesinde Device ID, tag name, firma adı ve lokasyon adı alanlarında metin bazlı arama sunacaktır
2. THE Arama_Filtreleme_Modülü SHALL kullanıcı listesinde ad, kullanıcı adı ve rol alanlarında metin bazlı arama sunacaktır
3. WHEN arama kutusu boşaltılır, THE Arama_Filtreleme_Modülü SHALL tüm kayıtları yeniden görüntüleyecektir
4. THE Arama_Filtreleme_Modülü SHALL arama sonuçlarını anlık olarak (her tuş vuruşunda) filtreleyecektir
5. WHEN arama sonucu boş döner, THE Arama_Filtreleme_Modülü SHALL "bulunamadı" bilgi mesajını görüntüleyecektir
6. THE Arama_Filtreleme_Modülü SHALL kullanıcı arama kutusunda temizleme (X) butonu sunacaktır


### Gereksinim 12: Dashboard ve İstatistikler

**Kullanıcı Hikayesi:** Bir kullanıcı olarak, rolüme uygun özet istatistikleri ve genel bakış bilgilerini tek bir ekranda görmek istiyorum, böylece sistem durumunu hızlıca değerlendirebilmeliyim.

#### Kabul Kriterleri

1. WHILE admin dashboard sayfasını görüntülerken, THE Dashboard_Modülü SHALL toplam firma sayısı, toplam lokasyon sayısı, toplam kullanıcı sayısı ve toplam cihaz sayısı (online adet bilgisiyle) istatistik kartlarını görüntüleyecektir
2. THE Dashboard_Modülü SHALL admin dashboard sayfasında firma bazlı özet tablosu sunacaktır (lokasyon sayısı, cihaz sayısı, online cihaz sayısı)
3. WHILE company_manager dashboard sayfasını görüntülerken, THE Dashboard_Modülü SHALL yalnızca atandığı firmaya ait lokasyon ve cihaz bilgilerini görüntüleyecektir
4. WHILE location_manager dashboard sayfasını görüntülerken, THE Dashboard_Modülü SHALL yalnızca atandığı lokasyona ait cihaz bilgilerini görüntüleyecektir
5. WHILE user dashboard sayfasını görüntülerken, THE Dashboard_Modülü SHALL atandığı lokasyona ait cihazları sensör kartları formatında görüntüleyecektir

### Gereksinim 13: Sensör Kartı Görünümü

**Kullanıcı Hikayesi:** Bir kullanıcı olarak, sensör cihazlarının anlık değerlerini görsel kartlar üzerinde görmek istiyorum, böylece cihaz durumlarını hızlıca takip edebilmeliyim.

#### Kabul Kriterleri

1. THE Sistem SHALL her sensör cihazı için tag name, anlık değer, birim, Device ID, durum (online/offline) ve son güncelleme saatini içeren bir kart görüntüleyecektir
2. THE Sistem SHALL online cihazları yeşil, offline cihazları kırmızı durum etiketi ile gösterecektir
3. WHEN kullanıcı sensör kartındaki "İzle" butonuna tıklar, THE Sistem SHALL kullanıcının rolüne uygun cihaz geçmişi sayfasına yönlendirme yapacaktır

### Gereksinim 14: Veri Kalıcılığı ve State Yönetimi

**Kullanıcı Hikayesi:** Bir kullanıcı olarak, sayfa yenilendiğinde veya tarayıcı kapatılıp açıldığında verilerimin korunmasını istiyorum, böylece çalışmam kaybolmasın.

#### Kabul Kriterleri

1. THE Veri_Kalıcılık_Katmanı SHALL firma, lokasyon ve cihaz verilerini "scada-company-storage" anahtarı altında localStorage'da saklayacaktır
2. THE Veri_Kalıcılık_Katmanı SHALL cihaz geçmiş verilerini firma verileriyle birlikte aynı storage anahtarı altında saklayacaktır
3. THE Veri_Kalıcılık_Katmanı SHALL kullanıcı verilerini "scada-user-storage" anahtarı altında localStorage'da saklayacaktır
4. THE Veri_Kalıcılık_Katmanı SHALL oturum bilgilerini "auth-storage" anahtarı altında localStorage'da saklayacaktır
5. WHEN uygulama yeniden yüklendiğinde, THE Veri_Kalıcılık_Katmanı SHALL localStorage'dan en son kaydedilen state'i geri yükleyecektir

### Gereksinim 15: Responsive Tasarım ve Layout

**Kullanıcı Hikayesi:** Bir kullanıcı olarak, uygulamayı masaüstü ve mobil cihazlarda rahatça kullanmak istiyorum, böylece her ortamda verimli çalışabilmeliyim.

#### Kabul Kriterleri

1. THE Layout_Modülü SHALL sol tarafta sabit sidebar, üstte navbar ve ana içerik alanından oluşan bir sayfa düzeni sunacaktır
2. WHILE ekran genişliği 1024px ve üzerindeyken, THE Layout_Modülü SHALL sidebar'ı sabit olarak görüntüleyecektir
3. WHILE ekran genişliği 1024px altındayken, THE Layout_Modülü SHALL sidebar'ı gizleyecek ve hamburger menü butonu ile açılabilir hale getirecektir
4. WHEN mobil görünümde sidebar açıkken, THE Layout_Modülü SHALL sidebar arkasında yarı saydam overlay görüntüleyecektir
5. THE Layout_Modülü SHALL sidebar'ın daraltılabilir (collapsed) modunu destekleyecektir
6. THE Layout_Modülü SHALL rol bazlı menü öğelerini sidebar'da görüntüleyecektir
7. THE Layout_Modülü SHALL aktif menü öğesini görsel olarak vurgulayacaktır (mavi arka plan)

### Gereksinim 16: Form Doğrulama ve Hata Yönetimi

**Kullanıcı Hikayesi:** Bir admin olarak, form girişlerinde hatalı veya eksik veri girdiğimde anlaşılır hata mesajları görmek istiyorum, böylece doğru veriyi girebilmeliyim.

#### Kabul Kriterleri

1. WHEN zorunlu bir form alanı boş bırakılır, THE Sistem SHALL ilgili hata mesajını form içinde görüntüleyecektir
2. WHEN benzersiz olması gereken bir alan (kullanıcı adı, Device ID) çakışırsa, THE Sistem SHALL çakışma hata mesajını görüntüleyecektir
3. IF bir CRUD işlemi sırasında hata oluşursa, THEN THE Sistem SHALL hata mesajını kırmızı renkte form altında görüntüleyecektir
4. WHEN bir modal form başarıyla gönderilir, THE Sistem SHALL modalı kapatacak ve listeyi güncelleyecektir

### Gereksinim 17: Cihaz Kataloğu ve Tip Yönetimi

**Kullanıcı Hikayesi:** Bir admin olarak, desteklenen cihaz tiplerini ve alt tiplerini merkezi bir katalogdan yönetmek istiyorum, böylece cihaz ekleme sürecinde tutarlılık sağlansın.

#### Kabul Kriterleri

1. THE Cihaz_Yönetim_Modülü SHALL sensör kategorisinde 12 alt tip tanımlayacaktır: Sıcaklık (°C), Basınç (bar), Nem (%), Titreşim (mm/s), Akış (m³/h), Seviye (cm), Voltaj (V), Akım (A), Güç (kW), CO₂ (ppm), Duman (%obs), Yakınlık (mm)
2. THE Cihaz_Yönetim_Modülü SHALL PLC kategorisinde 8 Delta DVP model tanımlayacaktır: DVP-ES2, DVP-EX2, DVP-SS2, DVP-SA2, DVP-SX2, DVP-EH3, DVP-EH2, DVP-PM
3. WHEN cihaz tipi ve alt tipi seçilir, THE Cihaz_Yönetim_Modülü SHALL birim bilgisini katalogdan otomatik olarak dolduracaktır
4. THE Cihaz_Yönetim_Modülü SHALL cihaz tipi değiştirildiğinde alt tip, birim, Modbus ve I/O yapılandırma alanlarını sıfırlayacaktır

### Gereksinim 18: Cihaz Veri Formatı Bilgi Ekranı

**Kullanıcı Hikayesi:** Bir admin olarak, her cihazın izleme sayfasında o cihaza dışarıdan veri göndermek için gerekli JSON formatını görmek istiyorum, böylece backend/MQTT/WebSocket entegrasyonunu doğru şekilde yapabilmeliyim.

#### Kabul Kriterleri

1. WHEN bir cihazın izleme sayfası görüntülenir, THE Sistem SHALL sağ üstteki durum etiketinin yanında bir soru işareti (?) ikonu gösterecektir
2. WHEN admin soru işareti ikonuna tıklar, THE Sistem SHALL cihazın mevcut yapılandırmasına göre dinamik olarak üretilmiş JSON şablonunu modal pencerede gösterecektir
3. THE Sistem SHALL sensör cihazları için deviceId, companyId, locationId, timestamp, type ve data (value, unit, status) alanlarını içeren JSON şablonu üretecektir
4. THE Sistem SHALL PLC cihazları için I/O yapılandırmasına göre digitalInputs (X adresleri), digitalOutputs (Y adresleri), analogInputs (AI kanalları), analogOutputs (AO kanalları) ve dataRegisters (D adresleri) alanlarını içeren JSON şablonu üretecektir
5. WHEN PLC I/O yapılandırması değiştirilir (örneğin dijital giriş sayısı 8'den 16'ya çıkarılır), THE Sistem SHALL JSON şablonunu güncel yapılandırmaya göre yeniden üretecektir
6. THE Sistem SHALL JSON şablonundaki tüm değerleri string formatında gösterecektir (frontend parse kurallarına uygun)
7. THE Sistem SHALL JSON şablonunu kopyalama (clipboard) butonu sunacaktır
8. WHEN dışarıdan gelen JSON verisi parse edilir, THE Sistem SHALL dijital I/O değerlerini "1"→ON (yeşil), "0"→OFF (kırmızı) olarak görselleştirecektir
9. WHEN dışarıdan gelen JSON verisi parse edilir, THE Sistem SHALL analog ve register değerlerini yapılandırılmış dataType'a göre (word→parseInt, float→parseFloat) parse edecektir

### Gereksinim 19: PLC I/O Nokta Bazlı Geçmiş Veri Yönetimi

**Kullanıcı Hikayesi:** Bir admin olarak, PLC cihazlarının her bir I/O noktasının (X, Y, AI, AO, D) geçmiş verilerini ayrı ayrı görüntülemek ve filtrelemek istiyorum, böylece her noktanın zaman bazlı değişimini analiz edebilmeliyim.

#### Kabul Kriterleri

1. THE Sistem SHALL PLC cihazlarının her bir I/O noktası (X0, X1, ..., Y0, Y1, ..., AI0, AI1, ..., AO0, AO1, ..., D0, D1, ...) için ayrı geçmiş veri kaydı tutacaktır
2. WHEN PLC izleme sayfasında bir I/O noktasının mevcut değeri görüntülenirken, THE Sistem SHALL dijital noktalar için ON/OFF (yeşil/kırmızı), analog ve register noktaları için numerik değer gösterecektir
3. WHEN admin veya yetkili kullanıcı bir I/O noktasına (örneğin X0) tıklar, THE Sistem SHALL o noktanın geçmiş verilerini tarih sırasına göre (en yeni en üstte) tablo formatında görüntüleyecektir
4. THE Sistem SHALL I/O nokta geçmiş tablosunda her kayıt için sıra numarası, değer, tarih ve saat bilgilerini gösterecektir
5. THE Sistem SHALL I/O nokta geçmiş tablosunda başlangıç ve bitiş tarih/saat filtresi sunacaktır
6. THE Sistem SHALL I/O nokta geçmiş tablosunda sayfa başına gösterilecek kayıt sayısı seçimi sunacaktır (50, 100, 200)
7. WHEN PLC cihazına yeni veri geldiğinde, THE Sistem SHALL her I/O noktasının geçmiş kaydına yeni bir zaman damgalı kayıt ekleyecektir
8. THE Sistem SHALL dijital I/O noktaları için geçmiş tabloda değer sütununda ON/OFF etiketini (yeşil/kırmızı badge) gösterecektir
9. THE Sistem SHALL analog ve register noktaları için geçmiş tabloda değer sütununda dataType'a göre parse edilmiş numerik değeri gösterecektir
10. WHILE admin rolündeki bir kullanıcı I/O nokta geçmişini görüntülerken, THE Sistem SHALL "Tüm Geçmişi Sil" butonunu gösterecek ve silme işlemi için admin şifresi doğrulaması isteyecektir
