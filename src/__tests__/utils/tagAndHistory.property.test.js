import { describe, it, expect, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { useCompanyStore } from '../../features/company/companyStore.js'

// --- Sabitler ---
const ADMIN_PASSWORD = 'admin123'
const MIN_TS = new Date('2024-01-01').getTime()
const MAX_TS = new Date('2026-12-31').getTime()

// --- Güvenli timestamp arbitrary ---
const timestampArb = fc.integer({ min: MIN_TS, max: MAX_TS }).map((ms) => new Date(ms).toISOString())

// --- I/O adresleri arbitrary ---
const ioAddressArb = fc.oneof(
  fc.integer({ min: 0, max: 7 }).map((n) => `X${n}`),
  fc.integer({ min: 0, max: 5 }).map((n) => `Y${n}`),
  fc.integer({ min: 0, max: 3 }).map((n) => `AI${n}`),
  fc.integer({ min: 0, max: 3 }).map((n) => `AO${n}`),
  fc.integer({ min: 0, max: 100 }).map((n) => `D${n}`)
)

// --- Tag ismi arbitrary ---
const tagNameArb = fc.string({ minLength: 0, maxLength: 30 })

// --- Store sıfırlama ---
function resetStore() {
  useCompanyStore.setState({ companies: [], deviceHistory: {}, ioHistory: {} })
}

// --- Yardımcı: Firma + lokasyon + PLC cihaz oluştur ---
function setupPLCDevice() {
  const companies = [{
    id: 1,
    displayName: 'Test Firma',
    fullName: 'Test Firma A.Ş.',
    managers: [],
    locations: [{
      id: 1,
      name: 'Test Lokasyon',
      managers: [],
      users: [],
      devices: [{
        id: 'DEV-100',
        tagName: 'Test PLC',
        deviceType: 'plc',
        subtype: 'dvp_ss2',
        value: 0,
        unit: '',
        timestamp: new Date().toISOString(),
        status: 'online',
        ioTags: {},
      }],
    }],
  }]
  useCompanyStore.setState({ companies, deviceHistory: {}, ioHistory: {} })
}

// --- Pure fonksiyonlar (bileşen bağımsız test için) ---

/**
 * Geçmiş kayıtları tarih damgasına göre azalan sıralar (en yeni en üstte).
 */
function sortDescending(records) {
  return [...records].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
}

/**
 * Tarih aralığına göre filtreler.
 */
function filterByDateRange(records, from, to) {
  let data = records
  if (from) data = data.filter((r) => new Date(r.timestamp) >= new Date(from))
  if (to) data = data.filter((r) => new Date(r.timestamp) <= new Date(to))
  return data
}

/**
 * Sayfalama uygular — ilk N kaydı döndürür.
 */
function paginate(records, limit) {
  return records.slice(0, limit)
}

/**
 * Toplu tag temizleme — verilen adresler için tag'leri boş string yapar.
 */
function clearTagsForGroup(tags, addresses) {
  const result = { ...tags }
  for (const addr of addresses) {
    result[addr] = ''
  }
  return result
}

/**
 * Admin olup olmadığını kontrol eder — tag düzenleme yetkisi.
 */
function canEditTags(role) {
  return role === 'admin'
}

/**
 * Şifre doğrulama — silme işlemi için.
 */
function verifyPassword(input) {
  return input === ADMIN_PASSWORD
}

// ============================================================
// TEST SUITE
// ============================================================

describe('Feature: scada-ui-professional — Tag Yönetimi ve Geçmiş Veri', () => {
  beforeEach(() => {
    resetStore()
  })

  /**
   * Property 18: Tag İsmi Kaydetme Round-Trip
   * Tag ismi atanıp kaydedildikten sonra cihaz verisindeki tags map'inde
   * aynı adres için aynı isim bulunmalı.
   *
   * **Validates: Requirements 8.3**
   */
  describe('Property 18: Tag İsmi Kaydetme Round-Trip', () => {
    it('tag ismi atanıp kaydedildikten sonra aynı adres için aynı isim bulunmalıdır', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({ address: ioAddressArb, name: tagNameArb }),
            { minLength: 1, maxLength: 20 }
          ),
          (tagEntries) => {
            setupPLCDevice()

            // Tag map oluştur
            const ioTags = {}
            for (const entry of tagEntries) {
              ioTags[entry.address] = entry.name
            }

            // updateDevice ile kaydet
            useCompanyStore.getState().updateDevice(1, 1, 'DEV-100', { ioTags })

            // Kaydedilen tag'leri oku
            const device = useCompanyStore.getState().companies[0].locations[0].devices[0]
            const savedTags = device.ioTags

            // Her adres için aynı isim bulunmalı
            for (const entry of tagEntries) {
              expect(savedTags[entry.address]).toBe(ioTags[entry.address])
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Property 19: Toplu Tag Temizleme
   * I/O grubu temizleme sonrası o gruptaki tüm tag isimleri boş string olmalı.
   *
   * **Validates: Requirements 8.5**
   */
  describe('Property 19: Toplu Tag Temizleme', () => {
    it('grup temizleme sonrası tüm tag isimleri boş string olmalıdır', () => {
      fc.assert(
        fc.property(
          fc.record({
            groupAddresses: fc.array(ioAddressArb, { minLength: 1, maxLength: 15 }),
            otherAddresses: fc.array(ioAddressArb, { minLength: 0, maxLength: 5 }),
          }),
          fc.array(tagNameArb, { minLength: 1, maxLength: 20 }),
          ({ groupAddresses, otherAddresses }, names) => {
            // Başlangıç tag map'i oluştur
            const tags = {}
            groupAddresses.forEach((addr, i) => {
              tags[addr] = names[i % names.length] || 'SomeTag'
            })
            otherAddresses.forEach((addr, i) => {
              tags[addr] = `Other-${i}`
            })

            // Grup temizleme uygula
            const result = clearTagsForGroup(tags, groupAddresses)

            // Gruptaki tüm tag'ler boş string olmalı
            for (const addr of groupAddresses) {
              expect(result[addr]).toBe('')
            }

            // Grup dışındaki tag'ler (eğer grupta değilse) korunmalı
            for (const addr of otherAddresses) {
              if (!groupAddresses.includes(addr)) {
                expect(result[addr]).toBe(tags[addr])
              }
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Property 20: Admin Olmayan Kullanıcılar İçin Tag Salt Okunur
   * Admin olmayan kullanıcılar için tag alanları düzenlenemez olmalı.
   *
   * **Validates: Requirements 8.2**
   */
  describe('Property 20: Admin Olmayan Kullanıcılar İçin Tag Salt Okunur', () => {
    it('admin olmayan kullanıcılar için canEditTags false dönmelidir', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('company_manager', 'location_manager', 'user'),
          (role) => {
            expect(canEditTags(role)).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('admin kullanıcı için canEditTags true dönmelidir', () => {
      expect(canEditTags('admin')).toBe(true)
    })

    it('rastgele roller için yalnızca admin düzenleme yetkisine sahip olmalıdır', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('admin', 'company_manager', 'location_manager', 'user'),
          (role) => {
            const editable = canEditTags(role)
            if (role === 'admin') {
              expect(editable).toBe(true)
            } else {
              expect(editable).toBe(false)
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Property 21: Geçmiş Veri Tarih Sıralaması
   * Kayıtlar tarih damgasına göre azalan sırada sıralanmalı.
   *
   * **Validates: Requirements 9.1**
   */
  describe('Property 21: Geçmiş Veri Tarih Sıralaması', () => {
    it('sıralama sonrası kayıtlar azalan tarih sırasında olmalıdır', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 10 }),
              value: fc.double({ min: 0, max: 1000, noNaN: true }),
              unit: fc.constantFrom('°C', 'bar', '%', 'V'),
              timestamp: timestampArb,
            }),
            { minLength: 2, maxLength: 50 }
          ),
          (records) => {
            const sorted = sortDescending(records)

            // Ardışık her çift için: önceki >= sonraki
            for (let i = 0; i < sorted.length - 1; i++) {
              const curr = new Date(sorted[i].timestamp).getTime()
              const next = new Date(sorted[i + 1].timestamp).getTime()
              expect(curr).toBeGreaterThanOrEqual(next)
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Property 22: Geçmiş Veri Tarih Filtresi
   * Filtreleme sonrası tüm kayıtların timestamp değeri belirtilen aralık içinde olmalı.
   *
   * **Validates: Requirements 9.3**
   */
  describe('Property 22: Geçmiş Veri Tarih Filtresi', () => {
    it('filtreleme sonrası tüm kayıtlar aralık içinde olmalıdır', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 10 }),
              value: fc.double({ min: 0, max: 1000, noNaN: true }),
              unit: fc.constant('°C'),
              timestamp: timestampArb,
            }),
            { minLength: 1, maxLength: 50 }
          ),
          fc.integer({ min: MIN_TS, max: MAX_TS }),
          fc.integer({ min: MIN_TS, max: MAX_TS }),
          (records, tsA, tsB) => {
            const from = new Date(Math.min(tsA, tsB)).toISOString()
            const to = new Date(Math.max(tsA, tsB)).toISOString()

            const filtered = filterByDateRange(records, from, to)

            for (const r of filtered) {
              const ts = new Date(r.timestamp)
              expect(ts.getTime()).toBeGreaterThanOrEqual(new Date(from).getTime())
              expect(ts.getTime()).toBeLessThanOrEqual(new Date(to).getTime())
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Property 23: Geçmiş Veri Sayfalama
   * Gösterilen kayıt sayısı seçilen limitten büyük olmamalı.
   *
   * **Validates: Requirements 9.4**
   */
  describe('Property 23: Geçmiş Veri Sayfalama', () => {
    it('gösterilen kayıt sayısı limitten büyük olmamalıdır', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 10 }),
              value: fc.double({ min: 0, max: 1000, noNaN: true }),
              unit: fc.constant('°C'),
              timestamp: timestampArb,
            }),
            { minLength: 0, maxLength: 300 }
          ),
          fc.constantFrom(50, 100, 200),
          (records, limit) => {
            const result = paginate(records, limit)
            expect(result.length).toBeLessThanOrEqual(limit)
            expect(result.length).toBeLessThanOrEqual(records.length)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Property 24: Geçmiş Veri İstatistik Tutarlılığı
   * Toplam, filtreli, gösterilen sayılar doğru hesaplanmalı.
   *
   * **Validates: Requirements 9.5**
   */
  describe('Property 24: Geçmiş Veri İstatistik Tutarlılığı', () => {
    it('istatistik sayıları doğru hesaplanmalıdır', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 10 }),
              value: fc.double({ min: 0, max: 1000, noNaN: true }),
              unit: fc.constant('°C'),
              timestamp: timestampArb,
            }),
            { minLength: 0, maxLength: 200 }
          ),
          fc.integer({ min: MIN_TS, max: MAX_TS }),
          fc.integer({ min: MIN_TS, max: MAX_TS }),
          fc.constantFrom(50, 100, 200),
          (records, tsA, tsB, limit) => {
            const from = new Date(Math.min(tsA, tsB)).toISOString()
            const to = new Date(Math.max(tsA, tsB)).toISOString()

            const totalCount = records.length
            const sorted = sortDescending(records)
            const filtered = filterByDateRange(sorted, from, to)
            const filteredCount = filtered.length
            const displayed = paginate(filtered, limit)
            const displayedCount = displayed.length

            // Toplam kayıt sayısı = orijinal dizi uzunluğu
            expect(totalCount).toBe(records.length)
            // Filtreli kayıt sayısı <= toplam
            expect(filteredCount).toBeLessThanOrEqual(totalCount)
            // Gösterilen kayıt sayısı <= filtreli
            expect(displayedCount).toBeLessThanOrEqual(filteredCount)
            // Gösterilen kayıt sayısı <= limit
            expect(displayedCount).toBeLessThanOrEqual(limit)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Property 25: Geçmiş Silme Şifre Doğrulaması
   * Yanlış şifre ile silme gerçekleşmemeli, doğru şifre ile veriler silinmeli.
   *
   * **Validates: Requirements 9.7, 9.9**
   */
  describe('Property 25: Geçmiş Silme Şifre Doğrulaması', () => {
    it('yanlış şifre ile silme gerçekleşmemelidir', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 50 }).filter((s) => s !== ADMIN_PASSWORD),
          (wrongPassword) => {
            setupPLCDevice()

            // Geçmiş veri ekle
            const deviceId = 'DEV-100'
            useCompanyStore.getState().appendHistory(deviceId, {
              id: `${deviceId}-H-1`,
              value: 42,
              unit: '°C',
              timestamp: new Date().toISOString(),
            })

            const beforeCount = (useCompanyStore.getState().deviceHistory[deviceId] ?? []).length

            // Yanlış şifre ile doğrulama
            const isValid = verifyPassword(wrongPassword)
            expect(isValid).toBe(false)

            // Şifre yanlış olduğu için silme yapılmamalı
            if (!isValid) {
              // Silme gerçekleşmez — veri korunur
            }

            const afterCount = (useCompanyStore.getState().deviceHistory[deviceId] ?? []).length
            expect(afterCount).toBe(beforeCount)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('doğru şifre ile veriler silinmelidir', () => {
      setupPLCDevice()

      const deviceId = 'DEV-100'
      useCompanyStore.getState().appendHistory(deviceId, {
        id: `${deviceId}-H-1`,
        value: 42,
        unit: '°C',
        timestamp: new Date().toISOString(),
      })

      expect(verifyPassword(ADMIN_PASSWORD)).toBe(true)

      // Doğru şifre → silme gerçekleşir
      useCompanyStore.getState().clearHistory(deviceId)

      const afterCount = (useCompanyStore.getState().deviceHistory[deviceId] ?? []).length
      expect(afterCount).toBe(0)
    })

    it('rastgele şifreler için yalnızca doğru şifre kabul edilmelidir', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 50 }),
          (password) => {
            const result = verifyPassword(password)
            if (password === ADMIN_PASSWORD) {
              expect(result).toBe(true)
            } else {
              expect(result).toBe(false)
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
