# Tasarım Belgesi: PLC I/O Yapılandırma Formu Yeniden Tasarımı

## Genel Bakış

Mevcut `AdminCompanyDetail.jsx` içindeki PLC I/O yapılandırma bölümü, sabit adımlı dropdown menüler ve basit kanal listesiyle tanımlanmaktadır. Bu tasarım, I/O noktalarını tag adı, Modbus adresi ve açıklama gibi detaylarla esnek biçimde yapılandırmaya olanak tanımamaktadır.

Yeni tasarımda `PlcIoConfigForm` adlı bağımsız bir React bileşeni oluşturulur. Bu bileşen; `coils`, `analogChannels` ve `dataRegisters` olmak üç bölümden oluşur. Her bölümde kullanıcı serbest sayı girerek satır bazlı tablo elde eder. Bileşen `value / onChange` arayüzüyle kontrol edilebilir (controlled component) olarak tasarlanır ve hem "Cihaz Ekle" hem "Cihaz Düzenle" modallarında aynı bileşen kullanılır.

Backend `devices.plc_io_config` sütunu zaten generic JSON tutmaktadır; bu sütunda herhangi bir değişiklik gerekmez.

---

## Mimari

```
AdminCompanyDetail.jsx
  ├── "Cihaz Ekle" Modal
  │     └── PlcIoConfigForm  ← value={devForm.plcIoConfig}  onChange={...}
  └── "Cihaz Düzenle" Modal
        └── PlcIoConfigForm  ← value={devForm.plcIoConfig}  onChange={...}

src/components/
  └── PlcIoConfigForm.jsx    ← yeni bileşen (bu spec'in ana çıktısı)

src/features/device/
  └── deviceCatalog.js       ← DEFAULT_PLC_IO_CONFIG sabiti güncellenir (yeni boş yapı)
```

Bileşen herhangi bir global state'e (Zustand) bağımlı değildir; tüm durumu prop üzerinden alır ve prop üzerinden iletir. Bu sayede test edilmesi ve yeniden kullanılması kolaydır.

---

## Bileşenler ve Arayüzler

### `PlcIoConfigForm`

**Dosya:** `src/components/PlcIoConfigForm.jsx`

**Props:**

| Prop | Tip | Açıklama |
|---|---|---|
| `value` | `PlcIoConfig` | Güncel yapılandırma nesnesi |
| `onChange` | `(PlcIoConfig) => void` | Herhangi bir alan değişince çağrılır |

**PlcIoConfig tipi:**

```js
{
  coils: CoilSatır[],
  analogChannels: AnalogKanal[],
  dataRegisters: DataRegisterSatır[],
}
```

**CoilSatır:**
```js
{ plcTag: string, coilAddress: number, tagName: string, description: string }
```

**AnalogKanal:**
```js
{ plcTag: string, registerAddress: number, length: number, tagName: string, description: string }
```

**DataRegisterSatır:**
```js
{ plcTag: string, registerAddress: number, length: number, tagName: string, description: string }
```

### `IoSection` (iç yardımcı bileşen)

`PlcIoConfigForm.jsx` içinde tanımlanan tekrar edilebilir bölüm bileşeni. Her üç I/O bölümü (coils, analogChannels, dataRegisters) için aynı bileşen kullanılır; sütun tanımı prop olarak verilir.

**Props:**

| Prop | Tip | Açıklama |
|---|---|---|
| `title` | `string` | Bölüm başlığı ("Coil Listesi" vb.) |
| `rows` | `object[]` | Satır dizisi |
| `columns` | `ColumnDef[]` | Sütun tanımları (key, label, type, min?) |
| `defaultRow` | `object` | Yeni satır eklenirken kullanılacak varsayılan değer |
| `onChange` | `(rows: object[]) => void` | Satırlar değişince çağrılır |

**ColumnDef:**
```js
{ key: string, label: string, type: 'text' | 'number', min?: number }
```

### `deviceCatalog.js` — güncelleme

`DEFAULT_PLC_IO_CONFIG` sabiti kaldırılır ve yerine `DEFAULT_PLC_IO_CONFIG_V2` eklenir:

```js
export const DEFAULT_PLC_IO_CONFIG_V2 = {
  coils: [],
  analogChannels: [],
  dataRegisters: [],
}
```

Eski `DEFAULT_PLC_IO_CONFIG` sabiti geriye dönük uyumluluk için bir süre bırakılabilir veya kaldırılabilir (eski formda kullanılan importer'lar güncellenir).

---

## Veri Modelleri

### Yeni PlcIoConfig JSON (kayıt formatı)

```json
{
  "coils": [
    {
      "plcTag": "X0",
      "coilAddress": 1025,
      "tagName": "Pompa Çalışma",
      "description": "Sol hat pompası"
    }
  ],
  "analogChannels": [
    {
      "plcTag": "AI0",
      "registerAddress": 30001,
      "length": 1,
      "tagName": "Sıcaklık",
      "description": "Giriş sıcaklık sensörü"
    }
  ],
  "dataRegisters": [
    {
      "plcTag": "D0",
      "registerAddress": 4096,
      "length": 2,
      "tagName": "Sayaç",
      "description": ""
    }
  ]
}
```

### Eski Format (kaldırılıyor)

```json
{
  "digitalInputs": { "count": 8 },
  "digitalOutputs": { "count": 6 },
  "analogInputs": [{ "channel": 0, "dataType": "word" }],
  "analogOutputs": [{ "channel": 0, "dataType": "word" }],
  "dataRegister": { "start": 0, "end": 100, "dataType": "word" }
}
```

Bu eski format backend'de artık üretilmez; ancak mevcut kayıtlarda kalabilir. `PlcIoConfigForm` eski formatı tespit edince boş yapıya düşer (Gereksinim 6).

### Eski format tespiti

Aşağıdaki fonksiyon `PlcIoConfigForm` içinde kullanılır:

```js
function normalizeConfig(raw) {
  if (!raw) return { coils: [], analogChannels: [], dataRegisters: [] }
  // Yeni format kontrolü
  if ('coils' in raw || 'analogChannels' in raw || 'dataRegisters' in raw) {
    return {
      coils: raw.coils ?? [],
      analogChannels: raw.analogChannels ?? [],
      dataRegisters: raw.dataRegisters ?? [],
    }
  }
  // Eski format → boş başlangıç
  return { coils: [], analogChannels: [], dataRegisters: [] }
}
```

---

## Pad / Truncate Mantığı

AdetInput değeri değiştiğinde dizi şu fonksiyonla güncellenir:

```js
function resizeArray(arr, newCount, defaultRow) {
  if (newCount >= arr.length) {
    const padding = Array.from(
      { length: newCount - arr.length },
      () => ({ ...defaultRow })
    )
    return [...arr, ...padding]
  }
  return arr.slice(0, newCount)
}
```

Bu fonksiyon mevcut satır verilerini korur; yalnızca eklenen veya silinen uçları etkiler.

---

## Correctness Properties

*Property, bir sistemin tüm geçerli çalışmalarında doğru olması gereken bir özellik veya davranıştır — insan tarafından okunabilir spesifikasyon ile makine tarafından doğrulanabilir doğruluk garantileri arasındaki köprüdür.*

### Prework Analizi

**Acceptance Criteria Testing Prework:**

**1.2 / 1.4 / 1.5 — AdetInput değişince dizi doğru pad/truncate edilir**
Thoughts: Herhangi bir dizi ve herhangi bir yeni sayı için geçerli bir kural. Pad durumunda eski satırlar korunur, yeni boş satırlar eklenir. Truncate durumunda baştaki satırlar korunur. Property test ile her kombinasyon test edilebilir.
Classification: PROPERTY
Test Strategy: Rastgele dizi + rastgele yeni boyut üret, resizeArray çıktısını doğrula.

**1.3 / 2.3 / 3.3 + 5.3 / 5.4 / 5.5 — Her satır doğru alanları içerir (şema uygunluğu)**
Thoughts: Rastgele PlcIoConfig oluşturup her bölümdeki her satırın beklenen alanları taşıdığını kontrol etmek property test için idealdir. 5.1–5.5 ile birleştirilir.
Classification: PROPERTY
Test Strategy: Rastgele PlcIoConfig üret, normalizeConfig uygula, her satırın required alanlarını doğrula.

**1.6 / 2.6 / 3.6 — Satır silme: diğer satırlar korunur**
Thoughts: Herhangi bir index için silme işlemi, kalan satırların sırasını ve içeriğini değiştirmemeli. Metamorphic property.
Classification: PROPERTY
Test Strategy: Rastgele dizi üret, rastgele bir index sil, kalan elemanların özdeş olduğunu doğrula.

**4.4 — onChange her değişimde güncel değeri iletir**
Thoughts: React controlled component davranışı. UI event simülasyonu gerektiriyor; her input tipi için property yerine örnek bazlı test daha uygun.
Classification: EXAMPLE

**6.1 / 6.2 / 6.3 — Eski format uyumluluğu**
Thoughts: Belirli input kombinasyonları (null, eski format, yeni format). Sınır koşulları.
Classification: EDGE_CASE

**Property Reflection:**
- 1.2, 1.4, 1.5 tek property'de birleştiriliyor → "Dizi yeniden boyutlandırma mevcut veriyi korur"
- 1.3, 2.3, 3.3, 5.3, 5.4, 5.5 tek property'de birleştiriliyor → "Üretilen yapılandırma şema uygunluğu"
- 1.6, 2.6, 3.6 tek property'de birleştiriliyor → "Satır silme diğer satırları korur"

### Property 1: Dizi Yeniden Boyutlandırma Mevcut Veriyi Korur

*Her rastgele satır dizisi ve her hedef boyut için*, `resizeArray` fonksiyonu uygulandığında:
- Hedef boyut ≥ mevcut boyut ise tüm mevcut satırlar başta korunmalı ve sonuna boş satırlar eklenmelidir
- Hedef boyut < mevcut boyut ise ilk `n` satır olduğu gibi korunmalıdır

**Validates: Gereksinim 1.2, 1.4, 1.5, 2.2, 2.4, 2.5, 3.2, 3.4, 3.5**

### Property 2: Üretilen PlcIoConfig Şema Uygunluğu

*Her rastgele PlcIoConfig nesnesi için*, `normalizeConfig` uygulandıktan sonra:
- `coils` dizisindeki her eleman `plcTag` (string), `coilAddress` (number), `tagName` (string), `description` (string) alanlarını içermelidir
- `analogChannels` dizisindeki her eleman `plcTag`, `registerAddress`, `length` (≥1), `tagName`, `description` alanlarını içermelidir
- `dataRegisters` dizisindeki her eleman `plcTag`, `registerAddress`, `length` (≥1), `tagName`, `description` alanlarını içermelidir

**Validates: Gereksinim 5.1, 5.2, 5.3, 5.4, 5.5**

### Property 3: Satır Silme Diğer Satırları Korur

*Her rastgele satır dizisi ve geçerli bir indeks için*, o indeksteki satır kaldırıldığında:
- Kalan satırların sırası ve içeriği değişmemelidir
- Yeni dizi uzunluğu orijinalden tam 1 eksik olmalıdır

**Validates: Gereksinim 1.6, 2.6, 3.6**

---

## Hata İşleme

- AdetInput sıfır veya negatif değer girildiğinde dizi boş (`[]`) kalır; form geçersiz giriş için hata göstermez, yalnızca satır oluşturmaz.
- AdetInput boş bırakılırsa (`""`) mevcut dizi değişmez (uncontrolled input koruması).
- `plcTag`, `tagName`, `description` alanları boş bırakılabilir; backend generic JSON kabul ettiğinden validasyon frontend'de zorunlu değildir.
- `coilAddress`, `registerAddress`, `length` alanları `type="number"` input ile girilir; tarayıcı sayısal olmayan girişi engeller.

---

## Test Stratejisi

Bu özellik **saf fonksiyon mantığı** (`resizeArray`, `normalizeConfig`) içerdiğinden property-based testing uygundur. UI render kısmı ise React snapshot ve örnek bazlı testlerle ele alınır.

**Property-Based Testing Kütüphanesi:** `fast-check` (mevcut projede Vitest tabanlı property test altyapısı var, aynı ekosistem)

**Test dosyası:** `src/__tests__/utils/plcIoConfig.property.test.js`

**Minimum iterasyon:** 100 (fast-check varsayılanı)

**Etiket formatı:** `// Feature: plc-io-config-redesign, Property {n}: {açıklama}`

### Birim Testleri (`plcIoConfig.unit.test.js`)

- `normalizeConfig(null)` → boş yapı
- `normalizeConfig(eskiFormat)` → boş yapı
- `normalizeConfig(yeniFormat)` → orijinal değer
- Cihaz Ekle modal açıldığında başlangıç değeri kontrolü
- onChange callback'inin doğru çağrıldığı

### Entegrasyon Testleri

Bu özellikte dış servis yoktur; entegrasyon testi gerekmez. `AdminCompanyDetail.jsx` değişikliği mevcut e2e akışında kapsanır.
