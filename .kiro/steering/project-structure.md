---
inclusion: always
---

# OFK-Main Proje Yapısı

Bu belge projenin güncel dizin ve dosya yapısını açıklar.
**Her değişiklikte bu belgeyi güncelle.**

---

## Kök Dizin

```
ofk-main/
├── .kiro/                        # Kiro AI konfigürasyonu
│   ├── steering/                 # Daima bağlam olarak yüklenen kurallar/belgeler
│   │   └── project-structure.md  # ← Bu dosya (proje yapısı haritası)
│   └── specs/                    # Özellik spec'leri (requirements / design / tasks)
│
├── backend/                      # Python FastAPI backend
├── src/                          # React frontend kaynak kodu
├── public/                       # Statik dosyalar (logo vb.)
│
├── index.html                    # Vite SPA giriş noktası
├── package.json                  # Frontend bağımlılıkları (React, Zustand, Recharts…)
├── vite.config.js                # Vite yapılandırması
├── tailwind.config.js            # Tailwind CSS yapılandırması
├── postcss.config.js             # PostCSS yapılandırması
└── docker-compose.yml            # PostgreSQL + Redis + Backend servisleri
```

---

## Backend (`backend/`)

FastAPI tabanlı async Python API sunucusu.

```
backend/
├── Dockerfile                    # Docker imajı tarifi
├── alembic.ini                   # Veritabanı migration konfigürasyonu
├── requirements.txt              # Python bağımlılıkları
├── main.py                       # Üretim ortamı başlatıcısı (PostgreSQL)
├── main_sqlite.py                # Geliştirme ortamı başlatıcısı (SQLite)
│
└── app/
    ├── __init__.py
    ├── main.py                   # FastAPI uygulama kurulumu, middleware, lifespan
    ├── models.py                 # SQLAlchemy ORM modelleri (tüm tablolar)
    ├── schemas.py                # Pydantic istek/yanıt şemaları
    ├── auth.py                   # JWT oluşturma, doğrulama, bcrypt hash
    ├── database.py               # Async SQLAlchemy engine + session
    ├── config.py                 # Ortam değişkenleri (Settings)
    ├── cache.py                  # Redis cache + Pub/Sub + batch buffer yardımcıları
    ├── ws_manager.py             # WebSocket bağlantı yöneticisi (Redis Pub/Sub destekli)
    ├── batch_worker.py           # Redis buffer'dan toplu DB yazımı (arka plan görevi)
    ├── seed.py                   # Varsayılan kullanıcı ve veri tohumlaması
    │
    └── routes/
        ├── __init__.py
        ├── auth_routes.py        # POST /api/auth/login
        ├── company_routes.py     # CRUD: firmalar, lokasyonlar, cihazlar
        ├── device_data_routes.py # POST /api/device-data (veri al), GET geçmiş, I/O nokta geçmişi
        ├── user_routes.py        # CRUD: kullanıcılar
        ├── alarm_routes.py       # Alarm konfigürasyonu ve alarm logları
        ├── export_routes.py      # GET /api/export/:id → Excel (.xlsx) dışa aktarım
        └── report_routes.py      # Özet raporlar
```

### Veritabanı Modelleri (`models.py`)

| Model | Tablo | Açıklama |
|---|---|---|
| `Company` | `companies` | Firmalar |
| `Location` | `locations` | Firmaya bağlı lokasyonlar |
| `Device` | `devices` | Lokasyona bağlı cihazlar (sensor/plc) |
| `DeviceData` | `device_data` | Cihazdan gelen ham zaman serisi verileri |
| `IOPointHistory` | `io_point_history` | PLC I/O nokta geçmişi (X0, Y0, AI0, D0…) |
| `AlarmConfig` | `alarm_configs` | Cihaz/adres başına alarm eşikleri |
| `AlarmLog` | `alarm_logs` | Tetiklenen alarm kayıtları |
| `User` | `users` | Kullanıcılar (4 rol) |

---

## Frontend (`src/`)

React 18 SPA — Zustand state yönetimi, React Router v6, Tailwind CSS.

```
src/
├── main.jsx                      # React uygulama giriş noktası
├── App.jsx                       # Tüm route tanımları + global data polling
├── index.css                     # Tailwind direktifleri
│
├── app/
│   └── ProtectedRoute.jsx        # Rol tabanlı koruma (RBAC wrapper)
│
├── features/                     # İş mantığı — state store'ları ve yardımcılar
│   ├── auth/
│   │   └── authStore.js          # Giriş/çıkış, JWT token, localStorage kalıcılığı
│   ├── company/
│   │   └── companyStore.js       # Firma/lokasyon/cihaz CRUD + I/O geçmiş state
│   ├── users/
│   │   └── userStore.js          # Kullanıcı CRUD state
│   └── device/
│       ├── deviceApi.js          # Cihaz veri API çağrıları (fetchDeviceData, clearHistory…)
│       ├── deviceCatalog.js      # Cihaz tipleri kataloğu, Modbus/PLC varsayılanları, Delta DVP adresleme
│       ├── generateJsonTemplate.js # Cihaza özgü JSON payload şablonu üretici
│       └── parseDeviceData.js    # Gelen ham veriyi UI formatına dönüştürücü
│
├── hooks/                        # Yeniden kullanılabilir React hook'ları
│   ├── useAuth.js                # Kimlik doğrulama durumu hook'u
│   ├── useDeviceLive.js          # WebSocket canlı veri aboneliği
│   ├── useFormValidation.js      # Form validasyon hook'u
│   └── useSearch.js              # Liste arama/filtreleme hook'u
│
├── components/                   # Paylaşımlı UI bileşenleri
│   ├── Layout/
│   │   ├── AppLayout.jsx         # Sidebar + Navbar sarmalayıcı
│   │   ├── Sidebar.jsx           # Sol menü navigasyonu
│   │   └── Navbar.jsx            # Üst bar (kullanıcı bilgisi, çıkış)
│   ├── AlarmPanel.jsx            # Alarm listesi ve konfigürasyon paneli
│   ├── ConfirmDialog.jsx         # Onay modal'ı (silme vb.)
│   ├── DeviceJsonInfoModal.jsx   # Cihaz JSON payload örneği modal'ı
│   ├── FormField.jsx             # Etiket + input sarmalayıcı
│   ├── IOPointHistoryPanel.jsx   # PLC I/O nokta geçmiş paneli
│   ├── Modal.jsx                 # Genel amaçlı modal
│   ├── SearchInput.jsx           # Arama kutusu bileşeni
│   ├── SensorCard.jsx            # Sensör değer kartı
│   ├── StatCard.jsx              # Dashboard istatistik kartı
│   └── Table.jsx                 # Veri tablosu bileşeni
│
└── pages/                        # Sayfa bileşenleri — role göre gruplu
    ├── Login/
    │   └── LoginPage.jsx         # Giriş sayfası
    ├── Admin/                    # Rol: admin
    │   ├── AdminDashboard.jsx    # Sistem geneli özet (firma/lokasyon/cihaz sayıları)
    │   ├── AdminCompanies.jsx    # Firma listesi ve yönetimi
    │   ├── AdminCompanyDetail.jsx# Firma detayı (lokasyonlar + cihazlar)
    │   ├── AdminUsers.jsx        # Kullanıcı yönetimi
    │   ├── AdminDevices.jsx      # Tüm cihazlar listesi
    │   ├── AdminDeviceHistory.jsx# Cihaz geçmişi (shared sayfaya yönlendirici)
    │   └── adminMenu.jsx         # Admin sidebar menü öğeleri
    ├── Company/                  # Rol: company_manager
    │   ├── CompanyDashboard.jsx  # Firmanın lokasyon/cihaz özeti
    │   └── CompanyDeviceHistory.jsx
    ├── Location/                 # Rol: location_manager
    │   ├── LocationDashboard.jsx # Lokasyonun cihaz özeti
    │   └── LocationDeviceHistory.jsx
    ├── User/                     # Rol: user
    │   ├── UserDashboard.jsx     # Salt okunur cihaz izleme
    │   └── UserDeviceHistory.jsx
    ├── shared/
    │   └── DeviceHistoryPage.jsx # Tüm roller tarafından kullanılan cihaz geçmiş sayfası
    └── Unauthorized.jsx          # 403 erişim engeli sayfası
```

---

## Test (`src/__tests__/`)

Vitest tabanlı property-based testler.

```
src/__tests__/utils/
├── authRbac.property.test.js         # RBAC rol erişim kuralları
├── companyCrud.property.test.js      # Firma CRUD tutarlılığı
├── deltaAddressOctal.property.test.js# Delta DVP oktal adres hesaplama
├── deviceCatalog.property.test.js    # Cihaz kataloğu doğruluğu
├── deviceCatalog.unit.test.js        # Katalog unit testleri
├── formValidationProperty.test.js   # Form validasyon kuralları
├── generateJsonTemplate.test.js      # JSON şablon üretimi
├── hookTestHelper.js                 # Hook test yardımcıları
├── ioHistory.property.test.js        # I/O geçmiş state tutarlılığı
├── ioHistoryDateFilter.property.test.js # Tarih filtreleme
├── modbusParamRange.property.test.js # Modbus parametre aralıkları
├── parseDeviceData.test.js           # Ham veri parse doğruluğu
├── search.test.js                    # Arama fonksiyonu testleri
├── searchProperty.test.js            # Arama property testleri
├── tagAndHistory.property.test.js    # Tag/geçmiş ilişkisi
├── userUi.property.test.js           # Kullanıcı UI state
└── validation.test.js                # Genel validasyon
```

---

## Rol Hiyerarşisi

```
admin
  └── Tüm firmalar, lokasyonlar, cihazlar, kullanıcılar üzerinde tam yetki

company_manager
  └── Sadece kendi firması → lokasyonlar ve cihazlar

location_manager
  └── Sadece kendi lokasyonu → cihazlar

user
  └── Salt izleme (okuma)
```

---

## Veri Akışı

```
IoT Cihaz
  │
  ▼ POST /api/device-data
Backend (FastAPI)
  ├── Cihaz doğrula (kayıtlı + online + tip uyumu)
  ├── Kompakt PLC formatını genişlet (bit-pack → X0/Y0/AI0…)
  ├── Redis buffer'a ekle  ──►  batch_worker → PostgreSQL
  ├── I/O nokta geçmişi kaydet (io_point_history)
  ├── Alarm kontrolü (eşik aşımı varsa alarm_logs'a yaz)
  └── WebSocket push → bağlı tüm tarayıcılara anlık bildirim
```

---

## Teknoloji Özeti

| Katman | Teknoloji |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, Zustand, Recharts, React Router v6 |
| Backend | FastAPI, SQLAlchemy (async), Alembic, Pydantic |
| Veritabanı | PostgreSQL 16 |
| Cache / Mesajlaşma | Redis 7 (cache + Pub/Sub + batch buffer) |
| Kimlik Doğrulama | JWT (python-jose) + bcrypt |
| Test | Vitest, property-based testing |
| Altyapı | Docker Compose |

---

## ESP32 Bağlantı Yönetimi (Yeni Eklendi)

### Backend — Yeni Dosyalar

```
backend/app/
├── routes/
│   └── esp32_routes.py       # POST /api/esp32/register, /heartbeat; GET /api/esp32/devices
│                               # compute_status() — heartbeat yaşına göre durum hesabı
├── models.py                 # ESP32Device modeli eklendi (esp32_devices tablosu)
└── schemas.py                # ESP32RegisterRequest/Response, HeartbeatRequest/Response, DeviceOut eklendi
```

### Frontend — Yeni Dosyalar

```
src/
├── features/esp32/
│   └── esp32Store.js         # Zustand store — devices[], loading, error, fetchDevices()
└── pages/Admin/
    ├── AdminESP32Page.jsx    # /admin/esp32 sayfası — 10 sn polling, hata/yükleme durumları
    ├── ESP32DeviceTable.jsx  # Cihaz tablosu — durum renk kodlaması (🟢/🟡/🔴)
    └── ConnectionGuideModal.jsx # ? butonuna tıklayınca açılan AP Mode rehberi + API örnekleri
```

### Değiştirilen Dosyalar

```
src/pages/Admin/adminMenu.jsx  # "Bağlı Cihazlar" menü öğesi eklendi (Wifi ikonu)
src/App.jsx                    # /admin/esp32 route eklendi (admin rolü korumalı)
backend/app/main.py            # esp32_routes.router kaydedildi
```

### Firmware — Yeni Klasör

```
firmware/esp32_scada/
├── esp32_scada.ino            # Tam ESP32 Arduino firmware (AP mode, heartbeat, NVS, register)
└── README.md                  # Arduino IDE kurulumu ve kullanım rehberi (Türkçe)
```

### Bağlantı Durumu Eşikleri

```
Son heartbeat < 10 sn  → 🟢 Bağlı (connected)
10–30 sn               → 🟡 Bekleniyor (waiting)
> 30 sn                → 🔴 Çevrimdışı (offline)
```

### Yeni API Endpointleri

| Metot | URL | Açıklama |
|---|---|---|
| POST | `/api/esp32/register` | ESP32 ilk kayıt — kalıcı ID atar, aynı MAC tekrar gelirse idempotent |
| POST | `/api/esp32/heartbeat` | Canlılık sinyali — `last_seen` günceller, 404 → yeniden kayıt |
| GET | `/api/esp32/devices` | Tüm ESP32 cihaz listesi (Redis cache 10 sn TTL) |

---

## ESP32 ↔ Cihaz Eşleştirme (Yeni Eklendi)

### Yeni DB Kolonları (manuel `ALTER TABLE` ile eklendi)
- `devices.esp32_id` — INTEGER, nullable (soft link)
- `esp32_devices.device_id` — VARCHAR(20), nullable
- `esp32_devices.pending_config` — BOOLEAN, default false
- `esp32_devices.config_json` — TEXT, nullable

### Yeni API Endpoint
| Metot | URL | Açıklama |
|---|---|---|
| POST | `/api/esp32/link` | ESP32 ↔ Device çift yönlü soft-link; pending_config=true yapar |

### Heartbeat Güncellendi
- `pending_config=true` → heartbeat yanıtına `config` alanı eklenir (tam Config_Payload)
- `config_ack=true` gönderilirse → `pending_config=false` yapılır
- Config gönderildikten sonra otomatik `pending_config=false`

### Frontend Değişiklikleri
- `AdminCompanyDetail.jsx` — Cihaz ekleme modal'ına "🔗 Bağlı ESP32 Seç" dropdown eklendi (sadece `status=connected` olanlar listelenir)
- `ESP32DeviceTable.jsx` — "Bağlı Cihaz" sütunu eklendi (device_id badge)
- `AdminDevices.jsx` — "ESP32" sütunu eklendi (esp32_tag)
- `esp32Store.js` — `linkDevice(esp32Id, deviceId)` action eklendi

### Firmware (esp32_scada.ino v1.3)
- Heartbeat'te config alınınca Serial'e tam JSON yazdırır
- `device_id` NVS'e kaydeder
- Bir sonraki heartbeat'te `config_ack=true` gönderir (tek sefer)

### Akış
```
Admin → Firma → Lokasyon → Cihaz Ekle → ESP32 Seç → Kaydet
                                              ↓
                              POST /api/esp32/link
                                              ↓
                              ESP32 heartbeat → config alır
                                              ↓
                              Serial'de config görünür + NVS'e yazılır
```
