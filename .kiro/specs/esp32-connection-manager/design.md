# Tasarım Belgesi — ESP32 Bağlantı Yönetimi

## Genel Bakış

Bu tasarım, mevcut OFK-SCADA sistemine **dokunmadan** ESP32 cihaz yönetimini ekler. Üç katmandan oluşur:

1. **Backend katmanı** — FastAPI'ye eklenen `/api/esp32/*` endpointleri ve `esp32_devices` tablosu
2. **Frontend katmanı** — Admin paneline eklenen "Bağlı Cihazlar" sayfası (`/admin/esp32`)
3. **Firmware katmanı** — Arduino/C++ ESP32 yazılımı (AP mode provisioning + heartbeat)

Mevcut `Company`, `Location`, `Device`, `User` modelleri ve ilgili route'lar değiştirilmez. ESP32 altyapısı tamamen ayrı dosyalarda tutulur.

---

## Mimari

```mermaid
graph TD
    subgraph ESP32 Firmware
        A[İlk Açılış] --> B{NVS'de ID var mı?}
        B -- Hayır --> C[AP Mode: ESP32-Setup]
        C --> D[Provisioning UI: Wi-Fi + Server URL + Tag]
        D --> E[Wi-Fi'ye Bağlan]
        E --> F[POST /api/esp32/register]
        F --> G[ESP32_ID'yi NVS'e Yaz]
        B -- Evet --> H[Wi-Fi'ye Bağlan]
        G --> I[Heartbeat Loop]
        H --> I
        I --> J[POST /api/esp32/heartbeat her 5 sn]
    end

    subgraph Backend FastAPI
        F --> K[esp32_routes.py]
        J --> K
        K --> L[esp32_devices tablosu PostgreSQL]
        K --> M[Redis Cache TTL=10sn]
    end

    subgraph Frontend React
        N[Admin Sol Menü] --> O[/admin/esp32 Bağlı Cihazlar]
        O --> P[GET /api/esp32/devices her 10sn]
        P --> M
        O --> Q[Connection_Guide_Modal]
    end
```

---

## Bileşenler ve Arayüzler

### Backend Bileşenleri

#### `backend/app/models.py` — Yeni Model (Ekleme)

`ESP32Device` modeli mevcut `models.py` dosyasına eklenir. Mevcut modellere dokunulmaz.

```python
class ESP32Device(Base):
    __tablename__ = "esp32_devices"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    esp32_tag     = Column(String(200), nullable=False)
    device_type   = Column(String(100), nullable=False)
    model         = Column(String(100), nullable=False)
    mac_address   = Column(String(17), unique=True, nullable=False, index=True)
    ip_address    = Column(String(45))
    firmware_version = Column(String(50))
    status        = Column(String(20), default="offline")
    last_seen     = Column(DateTime, nullable=True)
    created_at    = Column(DateTime, server_default=func.now())
```

#### `backend/app/schemas.py` — Yeni Şemalar (Ekleme)

```python
class ESP32RegisterRequest(BaseModel):
    esp32_tag:        str
    device_type:      str
    model:            str
    mac_address:      str
    firmware_version: Optional[str] = "unknown"

class ESP32RegisterResponse(BaseModel):
    esp32_id: int
    status:   str       # "registered" | "exists"

class ESP32HeartbeatRequest(BaseModel):
    esp32_id:         int
    ip_address:       Optional[str] = None
    firmware_version: Optional[str] = None

class ESP32HeartbeatResponse(BaseModel):
    status: str         # "connected" | "waiting" | "offline"

class ESP32DeviceOut(BaseModel):
    id:               int
    esp32_tag:        str
    device_type:      str
    model:            str
    mac_address:      str
    ip_address:       Optional[str]
    firmware_version: Optional[str]
    status:           str
    last_seen:        Optional[str]
    created_at:       str
```

#### `backend/app/routes/esp32_routes.py` — Yeni Route Dosyası

Üç endpoint içerir:

| Endpoint | Metot | Açıklama |
|---|---|---|
| `/api/esp32/register` | POST | İlk kayıt veya mevcut ID döndür |
| `/api/esp32/heartbeat` | POST | `last_seen` güncelle |
| `/api/esp32/devices` | GET | Cihaz listesi (cache destekli) |

**Status Hesaplama Fonksiyonu:**

```python
from datetime import datetime, timezone

def compute_status(last_seen: datetime | None) -> str:
    if last_seen is None:
        return "offline"
    now = datetime.now(timezone.utc)
    delta = (now - last_seen.replace(tzinfo=timezone.utc)).total_seconds()
    if delta < 10:
        return "connected"
    elif delta < 30:
        return "waiting"
    else:
        return "offline"
```

Bu fonksiyon hem `GET /devices` hem de `POST /heartbeat` yanıtlarında kullanılır.

#### `backend/app/main.py` — Router Kaydı (Ekleme)

```python
from app.routes import esp32_routes
app.include_router(esp32_routes.router)
```

---

### Frontend Bileşenleri

#### `src/features/esp32/esp32Store.js` — Yeni Zustand Store

```javascript
// State: devices[], loading, error
// Actions: fetchDevices() — GET /api/esp32/devices
```

#### `src/pages/Admin/AdminESP32Page.jsx` — Yeni Sayfa

Mevcut Admin sayfalarıyla aynı `AppLayout` sarmalayıcısını kullanır. `adminMenu` dizisine yeni öğe eklenerek sidebar'da görünür.

Bileşen yapısı:

```
AdminESP32Page
├── AppLayout (adminMenu)
├── Başlık + "?" butonu (Connection_Guide_Modal açar)
├── Yükleniyor Göstergesi (loading=true iken)
├── Hata Mesajı + Yeniden Dene butonu (error durumunda)
├── ESP32DeviceTable (devices[])
└── ConnectionGuideModal (isOpen, onClose)
```

#### `src/pages/Admin/ESP32DeviceTable.jsx` — Tablo Bileşeni

Sütunlar: ID | ESP32 Tag | Cihaz Türü | Model | IP Adresi | Durum | Son Görülme

Durum göstergesi:

```javascript
const STATUS_CONFIG = {
  connected: { icon: '🟢', label: 'Bağlı',       className: 'text-green-600' },
  waiting:   { icon: '🟡', label: 'Bekleniyor',  className: 'text-yellow-600' },
  offline:   { icon: '🔴', label: 'Çevrimdışı',  className: 'text-red-500' },
}
```

#### `src/pages/Admin/ConnectionGuideModal.jsx` — Rehber Modal

Mevcut `Modal.jsx` bileşeni üzerine inşa edilir. İçerik:

1. **AP Mode Bağlantı Adımları** — Numaralı liste
2. **Register API** — `POST /api/esp32/register` istek/yanıt JSON kod bloğu
3. **Heartbeat API** — `POST /api/esp32/heartbeat` istek/yanıt JSON kod bloğu

#### `src/pages/Admin/adminMenu.jsx` — Güncelleme

```javascript
import { Wifi } from 'lucide-react'

// Mevcut öğelere eklenir:
{ path: '/admin/esp32', label: 'Bağlı Cihazlar', icon: <Wifi size={18} /> }
```

#### `src/App.jsx` — Yeni Route Ekleme

```jsx
import AdminESP32Page from './pages/Admin/AdminESP32Page'

<Route path="/admin/esp32" element={
  <ProtectedRoute allowedRoles={['admin']}><AdminESP32Page /></ProtectedRoute>
} />
```

---

### Firmware Bileşenleri

#### `firmware/esp32_scada/esp32_scada.ino` — Ana Dosya

Bölümler:

| Bölüm | Sorumluluk |
|---|---|
| `setup()` | NVS oku, Wi-Fi veya AP modu başlat |
| `loop()` | Heartbeat zamanlayıcısı, Wi-Fi yeniden bağlantı |
| `startAPMode()` | SoftAP + HTTP sunucusu başlat |
| `handleProvisioningForm()` | HTML form sun ve gönderilen bilgileri işle |
| `connectWifi()` | SSID+şifreyle Wi-Fi bağlantısı kur |
| `registerDevice()` | `POST /api/esp32/register` çağır, ID'yi NVS'e yaz |
| `sendHeartbeat()` | `POST /api/esp32/heartbeat` çağır |
| `saveToNVS()` / `loadFromNVS()` | Kalıcı veri okuma/yazma |

#### Kütüphaneler (Arduino IDE / PlatformIO)

| Kütüphane | Amaç |
|---|---|
| `WiFi.h` | Wi-Fi bağlantısı |
| `WebServer.h` | AP mode HTTP sunucu |
| `Preferences.h` | NVS kalıcı depolama |
| `HTTPClient.h` | HTTP POST istekleri |
| `ArduinoJson.h` | JSON parse/serialize |

OTA update desteği `Update.h` ile opsiyonel olarak eklenebilir; temel işlevselliği etkilemez.

#### NVS Anahtar Yapısı

```
namespace: "esp32cfg"
  wifi_ssid       → String
  wifi_pass       → String
  server_url      → String
  esp32_tag       → String
  device_type     → String
  esp32_id        → Int32 (0 = kayıtsız)
```

#### Provisioning HTTP Form Şeması

AP Mode'da 192.168.4.1 adresinde sunulan HTML form şu alanları içerir:

```
Wi-Fi SSID     (dropdown: tarama listesi)
Wi-Fi Şifre    (password input)
Sunucu URL     (text: örn. http://192.168.1.100:8000)
ESP32 Tag      (text: cihaz tanımlayıcısı)
Cihaz Türü     (text: örn. sensor, plc)
```

#### Register İstek/Yanıt Formatı

```json
// POST /api/esp32/register
{
  "esp32_tag": "Fabrika-ESP32-01",
  "device_type": "sensor",
  "model": "ESP32-WROOM-32",
  "mac_address": "AA:BB:CC:DD:EE:FF",
  "firmware_version": "1.0.0"
}

// Yanıt
{
  "esp32_id": 1,
  "status": "registered"
}
```

#### Heartbeat İstek/Yanıt Formatı

```json
// POST /api/esp32/heartbeat
{
  "esp32_id": 1,
  "ip_address": "192.168.1.42",
  "firmware_version": "1.0.0"
}

// Yanıt
{
  "status": "connected"
}
```

---

## Veri Modelleri

### `esp32_devices` Tablosu

| Sütun | Tip | Kısıt | Açıklama |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | Kalıcı ESP32 kimliği |
| `esp32_tag` | VARCHAR(200) | NOT NULL | Kullanıcı tanımlı etiket |
| `device_type` | VARCHAR(100) | NOT NULL | Cihaz türü (sensor, plc…) |
| `model` | VARCHAR(100) | NOT NULL | Donanım modeli |
| `mac_address` | VARCHAR(17) | UNIQUE, NOT NULL | Fiziksel adres |
| `ip_address` | VARCHAR(45) | — | Son bilinen IP |
| `firmware_version` | VARCHAR(50) | — | Yazılım sürümü |
| `status` | VARCHAR(20) | DEFAULT 'offline' | Anlık durum (hesaplanan) |
| `last_seen` | DATETIME | NULLABLE | Son heartbeat zamanı (UTC) |
| `created_at` | DATETIME | DEFAULT NOW() | Kayıt tarihi |

**Önemli:** Bu tablo `companies`, `locations`, `devices` tablolarına yabancı anahtar içermez. Gelecekte ilişkilendirme gerekirse ayrı bir birleştirme tablosu (`esp32_device_links`) oluşturulur.

### State Akışı (Frontend)

```
esp32Store.devices[]
  ↑ fetchDevices() → GET /api/esp32/devices
  ↑ setInterval(10000) — AdminESP32Page mount sırasında
  ↓ AdminESP32Page render → ESP32DeviceTable prop olarak alır
```

---

## Doğruluk Özellikleri

*Bir özellik, sistemin tüm geçerli çalışmalarında doğru kalması gereken bir davranış veya koşuldur — insan tarafından okunabilir spesifikasyonlar ile makine tarafından doğrulanabilir garantiler arasındaki köprüdür.*

**PBT Uygulanabilirlik Değerlendirmesi:**

Backend iş mantığı — özellikle `compute_status()` ve kayıt idempotency mantığı — saf (pure) fonksiyonlar veya belirgin girdi/çıktı davranışı içerdiğinden property-based testing uygundur. UI bileşenleri ve firmware katmanı PBT kapsamı dışında tutulur.

---

### Kabul Kriteri Test Ön Çalışması

```
Kabul Kriterleri Test Ön Çalışması:

1.1. WHEN bir ESP32 kayıt isteği geldiğinde, THE ESP32_Server SHALL benzersiz ESP32_ID döndürür
  Düşünceler: Farklı MAC adresleri için ID ataması. Her geçerli kayıt isteğinin benzersiz bir ID alması
              gerekiyor. Rastgele MAC adresleri üretip her birinin benzersiz ID almasını test edebiliriz.
  Sınıflandırma: PROPERTY
  Test Stratejisi: N farklı MAC adresi için kayıt yap, ID'lerin kesişimsiz olduğunu doğrula

1.2. THE ESP32_Server SHALL ID'leri asla tekrar kullanmaz (monoton artan)
  Düşünceler: Ardışık kayıtlarda ID'lerin sıralı ve benzersiz olması. Sıralama + benzersizlik invariantı.
  Sınıflandırma: PROPERTY
  Test Stratejisi: N kayıt ardından ID dizisinin sıralı ve benzersiz olduğunu doğrula

1.3. WHEN aynı MAC adresiyle ikinci kayıt geldiğinde, THE ESP32_Server SHALL mevcut ID'yi döndürür
  Düşünceler: Idempotency özelliği. Aynı MAC ile iki kayıt → aynı ID. Round-trip property.
  Sınıflandırma: PROPERTY
  Test Stratejisi: Herhangi bir MAC için register(mac) == register(mac) olduğunu doğrula

1.4. WHEN eksik alan varsa, THE ESP32_Server SHALL 422 döndürür
  Düşünceler: Hata senaryosu, belirli bir girdi kümesi için. Özellikle eksik alan kombinasyonları.
  Sınıflandırma: EXAMPLE
  Test Stratejisi: Eksik her zorunlu alan için 422 beklenir

1.5. THE ESP32_Server SHALL kayıt anında last_seen'i doldurur
  Düşünceler: Kayıt sonrası last_seen null olmamalı. Bu invariant tüm geçerli kayıtlar için geçerli.
  Sınıflandırma: PROPERTY
  Test Stratejisi: Her kayıt sonrası last_seen != null olduğunu doğrula

2.1. WHEN heartbeat geldiğinde, THE ESP32_Server SHALL last_seen'i günceller
  Düşünceler: Herhangi bir kayıtlı cihaz için heartbeat → last_seen'in güncellendiği. Evrensel kural.
  Sınıflandırma: PROPERTY
  Test Stratejisi: Rastgele kayıtlı cihaz için heartbeat → last_seen yeni değer içeriyor

2.2. WHEN bilinmeyen ID geldiğinde, THE ESP32_Server SHALL 404 döndürür
  Düşünceler: Belirli hata senaryosu.
  Sınıflandırma: EXAMPLE
  Test Stratejisi: Kayıtsız ID ile heartbeat → 404

2.3. THE ESP32_Server SHALL heartbeat yanıtına status ekler
  Düşünceler: Her heartbeat yanıtının status alanı içermesi. Evrensel alan varlığı.
  Sınıflandırma: PROPERTY
  Test Stratejisi: Her heartbeat yanıtında status alanı {"connected","waiting","offline"}'dan biri

3.2. THE ESP32_Server SHALL Connection_Status'u last_seen'e göre hesaplar
  Düşünceler: Bu saf bir fonksiyon: f(last_seen_age) → status. Girdi aralığı sonsuz olduğundan
              property testi idealdir: <10sn → connected, 10-30sn → waiting, >30sn → offline.
  Sınıflandırma: PROPERTY
  Test Stratejisi: Rastgele delta_seconds değerleri üret, eşik mantığını doğrula

3.3. THE ESP32_Server SHALL cihaz listesini Redis cache'den döndürür
  Düşünceler: Redis entegrasyonunu test etmek dış servis testi anlamına gelir; PBT değil integration test.
  Sınıflandırma: INTEGRATION
  Test Stratejisi: 1-2 örnek ile cache hit/miss davranışını doğrula

3.4. THE ESP32_Server SHALL yanıtta gerekli alanları içerir
  Düşünceler: Tüm cihaz kayıtlarının gerekli alanları içermesi. Evrensel alan varlığı invariantı.
  Sınıflandırma: PROPERTY
  Test Stratejisi: Rastgele cihaz listesi için yanıttaki her kaydın gerekli 8 alanı içerdiğini doğrula
```

**Özellik Yansıması (Property Reflection):**
- Property 1.1 (benzersiz ID) ile Property 1.2 (monoton artan) örtüşüyor → birleştiriliyor
- Property 2.1 (last_seen güncellenir) ve Property 2.3 (status alanı var) bağımsız, korunur
- Property 3.4 (alan varlığı) hem GET hem de kayıt yanıtı için geçerli → tek kapsamlı property

---

### Özellik 1: Kayıt Idempotency

*Herhangi bir* geçerli MAC adresi için, aynı MAC adresiyle yapılan her kayıt isteği aynı `ESP32_ID` değerini döndürmelidir.

**Doğrular: Gereksinim 1.3**

---

### Özellik 2: ID Benzersizliği ve Monotonluğu

*Herhangi bir* N farklı MAC adresinden oluşan küme için, N kayıt ardından elde edilen ID dizisi hem benzersiz hem de sıralı (monoton artan) olmalıdır.

**Doğrular: Gereksinim 1.1, 1.2**

---

### Özellik 3: Kayıt Sonrası Zaman Damgası Varlığı

*Herhangi bir* geçerli kayıt isteği için, yanıttaki `ESP32_ID` ile sorgulandığında kaydın `last_seen` alanı null olmamalıdır.

**Doğrular: Gereksinim 1.5**

---

### Özellik 4: Heartbeat Sonrası `last_seen` Güncellemesi

*Herhangi bir* kayıtlı cihaz için, heartbeat gönderiminin ardından `last_seen` değeri gönderim öncesindeki değerden daha yeni bir zaman damgası içermelidir.

**Doğrular: Gereksinim 2.1**

---

### Özellik 5: Heartbeat Yanıtında Status Alanı

*Herhangi bir* geçerli heartbeat isteği için, yanıt gövdesi `status` alanını içermeli ve değeri `{"connected", "waiting", "offline"}` kümesinin bir üyesi olmalıdır.

**Doğrular: Gereksinim 2.3**

---

### Özellik 6: Bağlantı Durumu Eşik Doğruluğu

*Herhangi bir* `delta_seconds` (son heartbeat'ten geçen süre saniye cinsinden) değeri için:
- `delta_seconds < 10` → `status == "connected"`
- `10 ≤ delta_seconds < 30` → `status == "waiting"`
- `delta_seconds ≥ 30` → `status == "offline"`

Bu eşleşme `compute_status()` fonksiyonu için evrensel olarak geçerli olmalıdır.

**Doğrular: Gereksinim 3.2**

---

### Özellik 7: Cihaz Listesi Alan Bütünlüğü

*Herhangi bir* `esp32_devices` tablosu durumu için, `GET /api/esp32/devices` yanıtındaki her kaydın şu alanları içermesi gerekir: `id`, `esp32_tag`, `device_type`, `model`, `ip_address`, `status`, `last_seen`, `created_at`.

**Doğrular: Gereksinim 3.4**

---

## Hata Yönetimi

### Backend Hata Senaryoları

| Durum | HTTP Kodu | Yanıt |
|---|---|---|
| Eksik zorunlu alan (kayıt) | 422 | Pydantic validation error detayı |
| Bilinmeyen `esp32_id` (heartbeat) | 404 | `{"detail": "ESP32 cihazı bulunamadı"}` |
| Veritabanı bağlantı hatası | 500 | `{"detail": "Sunucu hatası"}` |
| Duplicate MAC adresi (kayıt) | 200 | Mevcut ID döndürülür (hata değil) |

### Firmware Hata Senaryoları

| Durum | Davranış |
|---|---|
| Wi-Fi bağlantı zaman aşımı (30sn) | AP moduna dön, HTML formda hata göster |
| Sunucu kayıt hatası | 60 sn bekle, 3 denemeden sonra AP moduna dön |
| Heartbeat 404 yanıtı | NVS'den ID'yi sil, yeniden kayıt akışını başlat |
| Wi-Fi koptu | 10 sn'de bir yeniden bağlan, 5 başarısız → cihazı yeniden başlat |
| NVS yazım başarısız | Kayıt akışını iptal et, AP moduna dön |

### Frontend Hata Senaryoları

| Durum | Davranış |
|---|---|
| `GET /api/esp32/devices` başarısız | Kırmızı hata mesajı + "Yeniden Dene" butonu |
| Veri yüklenirken | Skeleton/spinner göster |
| Boş cihaz listesi | "Henüz kayıtlı cihaz yok" boş durum mesajı |

---

## Test Stratejisi

### Birim Testler (Vitest — Frontend)

- `esp32Store.js` — `fetchDevices` durumu (loading, success, error)
- `ESP32DeviceTable.jsx` — Durum renk kodlaması (snapshot)
- `ConnectionGuideModal.jsx` — Açılış/kapanış davranışı

### Birim Testler (pytest — Backend)

- `compute_status()` — Sınır değer örnekleri (delta=9, 10, 29, 30, 31 sn)
- `POST /api/esp32/register` — Eksik alan kombinasyonları (422 doğrulaması)
- `POST /api/esp32/heartbeat` — Bilinmeyen ID (404 doğrulaması)

### Özellik Tabanlı Testler (pytest + hypothesis — Backend)

Her özellik için minimum 100 iterasyon. Test etiketi formatı:
`Feature: esp32-connection-manager, Property N: <özellik_metni>`

- **Özellik 1** — MAC adresi üreteci ile idempotency
- **Özellik 2** — N MAC adresi kümesi üreteci ile ID benzersizlik ve monotonluk
- **Özellik 3** — Rastgele geçerli kayıt verisi ile `last_seen` varlığı
- **Özellik 4** — Kayıtlı cihaz üreteci ile heartbeat sonrası `last_seen` tazeliği
- **Özellik 5** — Geçerli heartbeat isteği üreteci ile status alanı varlığı ve geçerliliği
- **Özellik 6** — `delta_seconds` float üreteci ile `compute_status()` eşik doğruluğu
- **Özellik 7** — Rastgele `esp32_devices` tablosu durumu ile alan bütünlüğü

### Entegrasyon Testleri

- Register → Heartbeat → GET devices tam akışı (1 örnek)
- Redis cache hit/miss davranışı (1-2 örnek)
- Duplicate MAC adresi kaydı → aynı ID (1 örnek)

### Firmware Testleri

Firmware C++ kodu için otomatik test kapsamı sınırlıdır. Manuel doğrulama adımları:
1. ESP32'yi temiz NVS ile açıp AP modu ağının göründüğünü doğrula
2. Provisioning formunu doldur, Wi-Fi bağlantısını ve kayıt ID alımını doğrula
3. Enerji kesip NVS'de ID'nin korunduğunu doğrula
4. Heartbeat trafiğini Wireshark/Serial Monitor ile gözlemle
