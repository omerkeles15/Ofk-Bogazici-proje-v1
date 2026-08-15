# Uygulama Planı: PLC I/O Yapılandırma Formu Yeniden Tasarımı

## Genel Bakış

Bu plan, `PlcIoConfigForm` bileşenini sıfırdan oluşturarak `AdminCompanyDetail.jsx` içindeki eski I/O yapılandırma bloklarının yerini almasını sağlar. Temel mantık fonksiyonları (`resizeArray`, `normalizeConfig`) önce izole olarak yazılır ve test edilir; ardından bileşen inşa edilir, son olarak mevcut modallar bileşeni kullanacak şekilde güncellenir.

---

## Görevler

- [ ] 1. Temel yardımcı fonksiyonları yaz
  - [ ] 1.1 `resizeArray` ve `normalizeConfig` fonksiyonlarını oluştur
    - `src/features/device/plcIoUtils.js` dosyasını oluştur
    - `resizeArray(arr, newCount, defaultRow)` — mevcut satırları koruyarak pad/truncate
    - `normalizeConfig(raw)` — null, eski format ve yeni format durumlarını ele al
    - `DEFAULT_COIL_ROW`, `DEFAULT_ANALOG_ROW`, `DEFAULT_REGISTER_ROW` sabit varsayılan satır nesnelerini dışa aktar
    - _Gereksinim: 1.2, 1.4, 1.5, 2.2, 2.4, 2.5, 3.2, 3.4, 3.5, 6.1, 6.2, 6.3_

  - [ ]* 1.2 `resizeArray` için property testi yaz
    - `src/__tests__/utils/plcIoConfig.property.test.js` dosyasını oluştur
    - `fast-check` kullanarak rastgele dizi ve boyut üret
    - Pad durumunda mevcut satırların korunduğunu, yeni satırların varsayılanla eklendiğini doğrula
    - Truncate durumunda ilk `n` satırın korunduğunu doğrula
    - `// Feature: plc-io-config-redesign, Property 1: Dizi yeniden boyutlandırma mevcut veriyi korur`
    - _Gereksinim: 1.2, 1.4, 1.5, 2.2, 2.4, 2.5, 3.2, 3.4, 3.5_

  - [ ]* 1.3 `normalizeConfig` için property ve birim testleri yaz
    - Aynı test dosyasına ekle
    - `normalizeConfig(null)` → `{ coils: [], analogChannels: [], dataRegisters: [] }`
    - `normalizeConfig(eskiFormat)` → boş yapı
    - `normalizeConfig(yeniFormat)` → orijinal değer
    - Rastgele yeni format nesnesi üret, normalize sonrası şema uygunluğunu doğrula
    - `// Feature: plc-io-config-redesign, Property 2: Üretilen PlcIoConfig şema uygunluğu`
    - _Gereksinim: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3_

- [ ] 2. Checkpoint — Yardımcı fonksiyon testleri
  - Tüm testlerin geçtiğinden emin ol: `npx vitest run src/__tests__/utils/plcIoConfig.property.test.js`
  - Hata varsa kullanıcıya sor.

- [ ] 3. `IoSection` iç bileşenini yaz
  - [ ] 3.1 `src/components/PlcIoConfigForm.jsx` dosyasını oluştur ve `IoSection` bileşenini tanımla
    - Props: `title`, `rows`, `columns` (ColumnDef[]), `defaultRow`, `onChange`
    - AdetInput (`type="number"`, `min="0"`) — değişince `resizeArray` ile satırları güncelle
    - Tablo başlıkları: ColumnDef.label + "İşlem" sütunu
    - Her satır için düzenlenebilir hücreler (text/number input)
    - Her satır için × silme butonu; silme sonrası AdetInput güncellenir
    - Satır tablosunu max yükseklik + `overflow-y-auto` ile sarmala
    - _Gereksinim: 1.2, 1.3, 1.6, 1.7, 2.2, 2.3, 2.6, 2.7, 3.2, 3.3, 3.6, 3.7_

  - [ ]* 3.2 Satır silme için property testi yaz
    - Aynı test dosyasına ekle
    - Rastgele dizi üret, rastgele indeks seç, satırı kaldır
    - Kalan satırların özdeş ve sırasının korunduğunu doğrula
    - Yeni uzunluğun orijinalden 1 eksik olduğunu doğrula
    - `// Feature: plc-io-config-redesign, Property 3: Satır silme diğer satırları korur`
    - _Gereksinim: 1.6, 2.6, 3.6_

- [ ] 4. `PlcIoConfigForm` ana bileşenini tamamla
  - [ ] 4.1 `PlcIoConfigForm` bileşenini `PlcIoConfigForm.jsx` dosyasına yaz
    - Props: `value` (PlcIoConfig), `onChange` (fonksiyon)
    - `normalizeConfig(value)` ile gelen veriyi normalize et
    - Üç `IoSection` bölümü: Coil Listesi, Analog Kanallar, Data Register
    - Coil sütunları: PLC Tag (text), Coil Adresi (number), Tag İsmi (text), Açıklama (text)
    - Analog sütunları: PLC Tag (text), Register Adresi (number), Uzunluk (number, min=1), Tag İsmi (text), Açıklama (text)
    - Register sütunları: PLC Tag (text), Register Adresi (number), Uzunluk (number, min=1), Tag İsmi (text), Açıklama (text)
    - Her bölüm değişince `onChange` ile güncel tam PlcIoConfig nesnesini ilet
    - Tailwind ile mevcut proje stiline uyumlu tasarım (mor tema — `border-purple-100`, `bg-purple-50/30`)
    - _Gereksinim: 1.1, 1.2, 1.3, 1.6, 1.7, 2.1, 2.2, 2.3, 2.6, 2.7, 3.1, 3.2, 3.3, 3.6, 3.7, 4.1, 4.4_

- [ ] 5. `deviceCatalog.js` güncelle
  - [ ] 5.1 `DEFAULT_PLC_IO_CONFIG_V2` sabitini ekle, eski `DEFAULT_PLC_IO_CONFIG`'i işaretle
    - `src/features/device/deviceCatalog.js` dosyasına `DEFAULT_PLC_IO_CONFIG_V2 = { coils: [], analogChannels: [], dataRegisters: [] }` ekle
    - Eski `DEFAULT_PLC_IO_CONFIG` sabitini JSDoc ile deprecated olarak işaretle (`@deprecated`)
    - `DATA_TYPES` sabiti bu spec kapsamında değiştirilmez
    - _Gereksinim: 4.5_

- [ ] 6. `AdminCompanyDetail.jsx` modallarını güncelle
  - [ ] 6.1 "Cihaz Ekle" modalındaki eski I/O bloğunu `PlcIoConfigForm` ile değiştir
    - `PlcIoConfigForm` import et
    - `devForm.plcIoConfig` başlangıç değerini `DEFAULT_PLC_IO_CONFIG_V2` olarak ayarla
    - `devForm.deviceType === 'plc' && devForm.subtype` koşulunda eski I/O bloğunun yerine `<PlcIoConfigForm value={devForm.plcIoConfig ?? DEFAULT_PLC_IO_CONFIG_V2} onChange={(v) => setDevForm({...devForm, plcIoConfig: v})} />` ekle
    - Eski blok (digitalInputs dropdown, analogInputs, analogOutputs, dataRegister) tamamen kaldır
    - _Gereksinim: 4.2, 4.4, 5.1, 5.2_

  - [ ] 6.2 "Cihaz Düzenle" modalındaki eski I/O bloğunu `PlcIoConfigForm` ile değiştir
    - Aynı şekilde eski bloğu kaldır, `PlcIoConfigForm` ile değiştir
    - `normalizeConfig` eski kayıtlarda boş başlangıç sağlar (bileşen içinde otomatik)
    - _Gereksinim: 4.3, 4.4, 6.1, 6.2, 6.3_

  - [ ] 6.3 Kullanılmayan import'ları temizle
    - `DEFAULT_PLC_IO_CONFIG`, `DATA_TYPES` import'larını kaldır (artık kullanılmıyorsa)
    - `getDeltaXAddresses`, `getDeltaYAddresses` referanslarını kontrol et — bu spec kapsamında kaldırılabilir
    - _Gereksinim: 4.1_

- [ ] 7. Checkpoint — Entegrasyon
  - Tüm testlerin geçtiğinden emin ol: `npx vitest run`
  - Tarayıcıda Firma → Lokasyon → Cihaz Ekle (PLC) → I/O yapılandırma bölümünün görüntülendiğini doğrula.
  - Hata varsa kullanıcıya sor.

---

## Notlar

- `*` ile işaretlenmiş alt görevler isteğe bağlıdır ve MVP için atlanabilir.
- Her görev belirli gereksinimlere referans verir.
- Checkpoint'ler artımlı doğrulama sağlar.
- Property testleri evrensel doğruluk özelliklerini; birim testleri belirli örnekleri ve edge case'leri kapsar.
- `fast-check` projede zaten kuruluysa (`package.json` kontrol et); kurulu değilse `npm install --save-dev fast-check` ile ekle.

## Görev Bağımlılık Grafiği

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "3.1"] },
    { "id": 2, "tasks": ["3.2", "4.1", "5.1"] },
    { "id": 3, "tasks": ["6.1", "6.2"] },
    { "id": 4, "tasks": ["6.3"] }
  ]
}
```
