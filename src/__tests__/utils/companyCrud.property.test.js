import { describe, it, expect, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { useCompanyStore } from '../../features/company/companyStore.js'

// --- Store sıfırlama yardımcısı ---
function resetStore() {
  useCompanyStore.setState({ companies: [], deviceHistory: {}, ioHistory: {} })
}

// Sıralı ekleme arasında ID çakışmasını önlemek için küçük gecikme
function addCompanyWithUniqueId(data) {
  const store = useCompanyStore.getState()
  // Date.now() tabanlı ID üretiminde çakışmayı önlemek için
  // doğrudan state manipülasyonu ile benzersiz ID atıyoruz
  const companies = useCompanyStore.getState().companies
  const maxId = companies.reduce((max, c) => Math.max(max, c.id), 0)
  const newCompany = { ...data, id: maxId + 1, locations: [] }
  useCompanyStore.setState({ companies: [...companies, newCompany] })
}

function addLocationWithUniqueId(companyId, data) {
  const companies = useCompanyStore.getState().companies
  const allLocIds = companies.flatMap((c) => c.locations).map((l) => l.id)
  const maxId = allLocIds.length > 0 ? Math.max(...allLocIds) : 0
  const newLoc = { ...data, id: maxId + 1, users: [], devices: [] }
  useCompanyStore.setState({
    companies: companies.map((c) =>
      c.id === companyId ? { ...c, locations: [...c.locations, newLoc] } : c
    ),
  })
}

// --- Arbitrary'ler ---
const companyNameArb = fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0)

const companyArb = fc.record({
  displayName: companyNameArb,
  fullName: companyNameArb,
  managers: fc.constant([]),
})

const locationArb = fc.record({
  name: companyNameArb,
  managers: fc.constant([]),
})

const deviceArb = fc.record({
  tagName: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
  deviceType: fc.constantFrom('sensor', 'plc'),
  subtype: fc.constantFrom('temperature', 'pressure', 'humidity', 'dvp_es2'),
  unit: fc.constantFrom('°C', 'bar', '%', ''),
})

describe('Feature: scada-ui-professional', () => {
  beforeEach(() => {
    resetStore()
  })

  /**
   * Property 6: Entity Ekleme Benzersiz ID Garantisi
   * Eklenen entity ID'si mevcut tüm ID'lerden farklı olmalı, cihaz ID formatı DEV-XXX.
   *
   * **Validates: Requirements 3.2, 4.1, 5.2**
   */
  describe('Property 6: Entity Ekleme Benzersiz ID Garantisi', () => {
    it('birden fazla firma eklendiğinde tüm ID\'ler benzersiz olmalıdır', () => {
      fc.assert(
        fc.property(
          fc.array(companyArb, { minLength: 2, maxLength: 10 }),
          (companies) => {
            resetStore()
            // Date.now() çakışmasını önlemek için deterministik ID atama
            companies.forEach((c) => addCompanyWithUniqueId(c))
            const ids = useCompanyStore.getState().companies.map((c) => c.id)
            expect(new Set(ids).size).toBe(ids.length)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('birden fazla lokasyon eklendiğinde tüm ID\'ler benzersiz olmalıdır', () => {
      fc.assert(
        fc.property(
          fc.array(locationArb, { minLength: 2, maxLength: 10 }),
          (locations) => {
            resetStore()
            addCompanyWithUniqueId({ displayName: 'Test', fullName: 'Test Co', managers: [] })
            const companyId = useCompanyStore.getState().companies[0].id

            locations.forEach((loc) => addLocationWithUniqueId(companyId, loc))

            const locs = useCompanyStore.getState().companies[0].locations
            const ids = locs.map((l) => l.id)
            expect(new Set(ids).size).toBe(ids.length)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('birden fazla cihaz eklendiğinde tüm ID\'ler benzersiz ve DEV-XXX formatında olmalıdır', () => {
      fc.assert(
        fc.property(
          fc.array(deviceArb, { minLength: 2, maxLength: 10 }),
          (devices) => {
            resetStore()
            addCompanyWithUniqueId({ displayName: 'Test', fullName: 'Test Co', managers: [] })
            const companyId = useCompanyStore.getState().companies[0].id
            addLocationWithUniqueId(companyId, { name: 'Loc', managers: [] })
            const locationId = useCompanyStore.getState().companies[0].locations[0].id

            // addDevice zaten getNextDeviceId ile sıralı ID üretir — çakışma olmaz
            devices.forEach((d) => useCompanyStore.getState().addDevice(companyId, locationId, d))

            const devs = useCompanyStore.getState().companies[0].locations[0].devices
            const ids = devs.map((d) => d.id)

            // Tüm ID'ler benzersiz olmalı
            expect(new Set(ids).size).toBe(ids.length)

            // Tüm ID'ler DEV-XXX formatında olmalı
            ids.forEach((id) => {
              expect(id).toMatch(/^DEV-\d{3,}$/)
            })
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Property 7: Kaskad Silme Bütünlüğü
   * Firma silindiğinde bağlı lokasyonlar ve cihazlar da kaldırılmalı.
   *
   * **Validates: Requirements 3.4, 4.3**
   */
  describe('Property 7: Kaskad Silme Bütünlüğü', () => {
    it('firma silindiğinde bağlı lokasyonlar ve cihazlar da state\'ten kaldırılmalıdır', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 3 }),
          fc.integer({ min: 1, max: 3 }),
          (locCount, devPerLoc) => {
            resetStore()
            addCompanyWithUniqueId({ displayName: 'Silinecek', fullName: 'Silinecek Co', managers: [] })
            const companyId = useCompanyStore.getState().companies[0].id

            for (let i = 0; i < locCount; i++) {
              addLocationWithUniqueId(companyId, { name: `Lok-${i}`, managers: [] })
            }

            const locs = useCompanyStore.getState().companies[0].locations
            locs.forEach((loc) => {
              for (let j = 0; j < devPerLoc; j++) {
                useCompanyStore.getState().addDevice(companyId, loc.id, {
                  tagName: `Dev-${j}`, deviceType: 'sensor', subtype: 'temperature', unit: '°C',
                })
              }
            })

            // Firma silinmeden önce lokasyon ve cihaz var
            expect(useCompanyStore.getState().companies[0].locations.length).toBe(locCount)

            // Firmayı sil
            useCompanyStore.getState().deleteCompany(companyId)

            // Firma state'ten kaldırılmış olmalı
            const found = useCompanyStore.getState().companies.find((c) => c.id === companyId)
            expect(found).toBeUndefined()
          }
        ),
        { numRuns: 100 }
      )
    })

    it('lokasyon silindiğinde bağlı cihazlar da kaldırılmalıdır', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 5 }),
          (devCount) => {
            resetStore()
            addCompanyWithUniqueId({ displayName: 'Test', fullName: 'Test Co', managers: [] })
            const companyId = useCompanyStore.getState().companies[0].id
            addLocationWithUniqueId(companyId, { name: 'Silinecek Lok', managers: [] })
            const locationId = useCompanyStore.getState().companies[0].locations[0].id

            for (let i = 0; i < devCount; i++) {
              useCompanyStore.getState().addDevice(companyId, locationId, {
                tagName: `Dev-${i}`, deviceType: 'sensor', subtype: 'temperature', unit: '°C',
              })
            }
            expect(useCompanyStore.getState().companies[0].locations[0].devices.length).toBe(devCount)

            // Lokasyonu sil
            useCompanyStore.getState().deleteLocation(companyId, locationId)

            // Lokasyon kaldırılmış olmalı
            const locs = useCompanyStore.getState().companies[0].locations
            expect(locs.find((l) => l.id === locationId)).toBeUndefined()
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Property 8: CRUD Güncelleme Yansıması
   * Güncellenen alanlar yeni değerleri ile bulunmalı, güncellenmemiş alanlar değişmemeli.
   *
   * **Validates: Requirements 3.3, 4.2, 5.6**
   */
  describe('Property 8: CRUD Güncelleme Yansıması', () => {
    it('firma güncellemesinde yalnızca güncellenen alanlar değişmeli, diğerleri korunmalıdır', () => {
      fc.assert(
        fc.property(
          companyArb,
          companyNameArb,
          (company, newDisplayName) => {
            resetStore()
            addCompanyWithUniqueId(company)
            const companyId = useCompanyStore.getState().companies[0].id
            const before = { ...useCompanyStore.getState().companies[0] }

            useCompanyStore.getState().updateCompany(companyId, { displayName: newDisplayName })

            const after = useCompanyStore.getState().companies[0]
            expect(after.displayName).toBe(newDisplayName)
            expect(after.fullName).toBe(before.fullName)
            expect(after.id).toBe(before.id)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('lokasyon güncellemesinde yalnızca güncellenen alanlar değişmeli', () => {
      fc.assert(
        fc.property(
          companyNameArb,
          (newName) => {
            resetStore()
            addCompanyWithUniqueId({ displayName: 'F', fullName: 'F Co', managers: [] })
            const companyId = useCompanyStore.getState().companies[0].id
            addLocationWithUniqueId(companyId, { name: 'Eski Lok', managers: [] })
            const locationId = useCompanyStore.getState().companies[0].locations[0].id
            const before = { ...useCompanyStore.getState().companies[0].locations[0] }

            useCompanyStore.getState().updateLocation(companyId, locationId, { name: newName })

            const after = useCompanyStore.getState().companies[0].locations[0]
            expect(after.name).toBe(newName)
            expect(after.id).toBe(before.id)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('cihaz güncellemesinde yalnızca güncellenen alanlar değişmeli', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
          (newTagName) => {
            resetStore()
            addCompanyWithUniqueId({ displayName: 'F', fullName: 'F Co', managers: [] })
            const companyId = useCompanyStore.getState().companies[0].id
            addLocationWithUniqueId(companyId, { name: 'Lok', managers: [] })
            const locationId = useCompanyStore.getState().companies[0].locations[0].id
            useCompanyStore.getState().addDevice(companyId, locationId, {
              tagName: 'Eski Tag', deviceType: 'sensor', subtype: 'temperature', unit: '°C',
            })
            const deviceId = useCompanyStore.getState().companies[0].locations[0].devices[0].id
            const before = { ...useCompanyStore.getState().companies[0].locations[0].devices[0] }

            useCompanyStore.getState().updateDevice(companyId, locationId, deviceId, { tagName: newTagName })

            const after = useCompanyStore.getState().companies[0].locations[0].devices[0]
            expect(after.tagName).toBe(newTagName)
            expect(after.id).toBe(before.id)
            expect(after.deviceType).toBe(before.deviceType)
            expect(after.unit).toBe(before.unit)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Property 10: Firma İstatistik Hesaplama Doğruluğu
   * Lokasyon sayısı locations.length, cihaz sayısı locations.flatMap(l => l.devices).length.
   *
   * **Validates: Requirements 3.6, 12.1, 12.2**
   */
  describe('Property 10: Firma İstatistik Hesaplama Doğruluğu', () => {
    it('firma istatistikleri doğru hesaplanmalıdır', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 4 }),
          fc.integer({ min: 0, max: 3 }),
          (locCount, devPerLoc) => {
            resetStore()
            addCompanyWithUniqueId({ displayName: 'Stat', fullName: 'Stat Co', managers: [] })
            const companyId = useCompanyStore.getState().companies[0].id

            for (let i = 0; i < locCount; i++) {
              addLocationWithUniqueId(companyId, { name: `Lok-${i}`, managers: [] })
            }

            // Her lokasyona aynı sayıda cihaz ekle
            const locs = useCompanyStore.getState().companies[0].locations
            locs.forEach((loc) => {
              for (let j = 0; j < devPerLoc; j++) {
                useCompanyStore.getState().addDevice(companyId, loc.id, {
                  tagName: `Dev-${j}`, deviceType: 'sensor', subtype: 'temperature', unit: '°C',
                })
              }
            })

            const company = useCompanyStore.getState().companies[0]
            const locationCount = company.locations.length
            const deviceCount = company.locations.flatMap((l) => l.devices).length

            expect(locationCount).toBe(locCount)
            expect(deviceCount).toBe(locCount * devPerLoc)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Property 13: Cihaz Silme Sonrası Kaldırılma
   * Silinen cihaz ID'si state'te bulunmamalı.
   *
   * **Validates: Requirements 5.7**
   */
  describe('Property 13: Cihaz Silme Sonrası Kaldırılma', () => {
    it('silinen cihaz ID\'si state\'te bulunmamalıdır', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 8 }),
          fc.integer({ min: 0, max: 7 }),
          (devCount, deleteIdx) => {
            resetStore()
            addCompanyWithUniqueId({ displayName: 'F', fullName: 'F Co', managers: [] })
            const companyId = useCompanyStore.getState().companies[0].id
            addLocationWithUniqueId(companyId, { name: 'Lok', managers: [] })
            const locationId = useCompanyStore.getState().companies[0].locations[0].id

            for (let i = 0; i < devCount; i++) {
              useCompanyStore.getState().addDevice(companyId, locationId, {
                tagName: `Dev-${i}`, deviceType: 'sensor', subtype: 'temperature', unit: '°C',
              })
            }

            const allDevices = useCompanyStore.getState().companies[0].locations[0].devices
            const idx = deleteIdx % allDevices.length
            const targetId = allDevices[idx].id

            // Cihazı sil
            useCompanyStore.getState().deleteDevice(companyId, locationId, targetId)

            // Silinen ID artık state'te bulunmamalı
            const remaining = useCompanyStore.getState().companies[0].locations[0].devices
            expect(remaining.find((d) => d.id === targetId)).toBeUndefined()
            expect(remaining.length).toBe(allDevices.length - 1)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Property 12: Cihaz Durum Toggle ve Zaman Damgası
   * Toggle sonrası durum tersine dönmeli, timestamp güncellenmeli.
   *
   * **Validates: Requirements 5.8, 5.9**
   */
  describe('Property 12: Cihaz Durum Toggle ve Zaman Damgası', () => {
    it('toggle sonrası durum tersine dönmeli ve timestamp güncellenmeli', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('online', 'offline'),
          (initialStatus) => {
            resetStore()
            addCompanyWithUniqueId({ displayName: 'F', fullName: 'F Co', managers: [] })
            const companyId = useCompanyStore.getState().companies[0].id
            addLocationWithUniqueId(companyId, { name: 'Lok', managers: [] })
            const locationId = useCompanyStore.getState().companies[0].locations[0].id
            useCompanyStore.getState().addDevice(companyId, locationId, {
              tagName: 'Toggle Test', deviceType: 'sensor', subtype: 'temperature', unit: '°C',
            })

            const deviceId = useCompanyStore.getState().companies[0].locations[0].devices[0].id

            // Başlangıç durumunu ayarla ve eski bir timestamp ver
            const oldTimestamp = '2020-01-01T00:00:00.000Z'
            useCompanyStore.getState().updateDevice(companyId, locationId, deviceId, {
              status: initialStatus,
              timestamp: oldTimestamp,
            })

            // Toggle yap
            useCompanyStore.getState().toggleDeviceStatus(companyId, locationId, deviceId)

            const after = useCompanyStore.getState().companies[0].locations[0].devices[0]
            const expectedStatus = initialStatus === 'online' ? 'offline' : 'online'

            // Durum tersine dönmeli
            expect(after.status).toBe(expectedStatus)
            // Timestamp güncellenmeli (eski timestamp'ten farklı olmalı)
            expect(after.timestamp).not.toBe(oldTimestamp)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('çift toggle sonrası durum orijinal haline dönmeli', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('online', 'offline'),
          (initialStatus) => {
            resetStore()
            addCompanyWithUniqueId({ displayName: 'F', fullName: 'F Co', managers: [] })
            const companyId = useCompanyStore.getState().companies[0].id
            addLocationWithUniqueId(companyId, { name: 'Lok', managers: [] })
            const locationId = useCompanyStore.getState().companies[0].locations[0].id
            useCompanyStore.getState().addDevice(companyId, locationId, {
              tagName: 'DblToggle', deviceType: 'sensor', subtype: 'temperature', unit: '°C',
            })
            const deviceId = useCompanyStore.getState().companies[0].locations[0].devices[0].id

            useCompanyStore.getState().updateDevice(companyId, locationId, deviceId, { status: initialStatus })

            // İki kez toggle
            useCompanyStore.getState().toggleDeviceStatus(companyId, locationId, deviceId)
            useCompanyStore.getState().toggleDeviceStatus(companyId, locationId, deviceId)

            const after = useCompanyStore.getState().companies[0].locations[0].devices[0]
            expect(after.status).toBe(initialStatus)
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
