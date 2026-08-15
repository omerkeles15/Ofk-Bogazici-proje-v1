import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

// ============================================================
// SAF FONKSİYONLAR — React bağımlılığı olmadan test edilir
// ============================================================

/**
 * Property 27: Kullanıcı ağaç yapısı gruplama
 * Kullanıcıları firma bazlı ağaç yapısında gruplar.
 * - Her firma altında yalnızca o firmaya atanmış kullanıcılar
 * - Firmaya atanmamışlar (companyId: null) ayrı bölümde
 */
function groupUsersByCompany(users, companies) {
  const tree = companies.map((company) => ({
    company,
    users: users.filter((u) => u.companyId === company.id),
  }))
  const unassigned = users.filter((u) => u.companyId == null)
  return { tree, unassigned }
}

/**
 * Property 28: Firma seçimine göre lokasyon filtreleme
 * Seçilen firmaya ait lokasyonları döndürür.
 */
function filterLocationsByCompany(companies, selectedCompanyId) {
  const company = companies.find((c) => c.id === selectedCompanyId)
  return company ? company.locations : []
}

/**
 * Property 30: Sensör kartı bilgi bütünlüğü
 * Sensör cihazından kart verisi çıkarır.
 */
function extractSensorCardData(device) {
  return {
    tagName: device.tagName,
    value: device.value,
    unit: device.unit,
    deviceId: device.id,
    status: device.status,
    lastUpdate: device.timestamp,
  }
}

/**
 * Property 31: Sensör kartı rol bazlı yönlendirme
 * Rol prefix'ine göre cihaz izleme yolu üretir.
 */
const ROLE_PREFIXES = {
  admin: '/admin',
  company_manager: '/company',
  location_manager: '/location',
  user: '/user',
}

function getDeviceRoute(role, deviceId) {
  const prefix = ROLE_PREFIXES[role]
  if (!prefix) return null
  return `${prefix}/device/${deviceId}`
}

/**
 * Property 32: State persist round-trip
 * JSON serialize/deserialize round-trip.
 */
function persistRoundTrip(state) {
  const serialized = JSON.stringify(state)
  return JSON.parse(serialized)
}

/**
 * Property 33: Rol bazlı menü öğeleri
 * Rol'e göre izin verilen menü öğelerini filtreler.
 */
const ROLE_ALLOWED_PATHS = {
  admin: ['/admin/dashboard', '/admin/companies', '/admin/devices', '/admin/users'],
  company_manager: ['/company/dashboard'],
  location_manager: ['/location/dashboard'],
  user: ['/user/dashboard'],
}

function filterMenuItemsByRole(menuItems, role) {
  const allowed = ROLE_ALLOWED_PATHS[role] ?? []
  return menuItems.filter((item) => allowed.includes(item.path))
}

// ============================================================
// JENERATÖRLER (Arbitraries)
// ============================================================

const MIN_TS = new Date('2024-01-01').getTime()
const MAX_TS = new Date('2026-12-31').getTime()
const timestampArb = fc.integer({ min: MIN_TS, max: MAX_TS }).map((ms) => new Date(ms).toISOString())

const roleArb = fc.constantFrom('admin', 'company_manager', 'location_manager', 'user')

const companyIdArb = fc.integer({ min: 1, max: 50 })

const companyArb = fc.record({
  id: companyIdArb,
  displayName: fc.string({ minLength: 1, maxLength: 20 }),
  fullName: fc.string({ minLength: 1, maxLength: 40 }),
  locations: fc.array(
    fc.record({
      id: fc.integer({ min: 1, max: 200 }),
      name: fc.string({ minLength: 1, maxLength: 20 }),
      devices: fc.constant([]),
    }),
    { minLength: 0, maxLength: 5 }
  ),
})


// Benzersiz company ID'leri olan firma listesi üreteci
const companiesArb = fc
  .array(companyArb, { minLength: 1, maxLength: 10 })
  .map((companies) => {
    const seen = new Set()
    return companies.filter((c) => {
      if (seen.has(c.id)) return false
      seen.add(c.id)
      return true
    })
  })

// Kullanıcı üreteci — companyId null veya geçerli bir firma ID'si olabilir
function userArb(companyIds) {
  const cidArb = companyIds.length > 0
    ? fc.oneof(fc.constant(null), fc.constantFrom(...companyIds))
    : fc.constant(null)
  return fc.record({
    id: fc.integer({ min: 1, max: 100000 }),
    username: fc.string({ minLength: 3, maxLength: 15 }).filter((s) => /^[a-z0-9_]+$/.test(s)),
    name: fc.string({ minLength: 1, maxLength: 25 }),
    role: roleArb,
    companyId: cidArb,
    locationId: fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 200 })),
  })
}

const deviceIdArb = fc.integer({ min: 1, max: 999 }).map((n) => `DEV-${String(n).padStart(3, '0')}`)

const sensorDeviceArb = fc.record({
  id: deviceIdArb,
  tagName: fc.string({ minLength: 1, maxLength: 20 }),
  value: fc.float({ min: -1000, max: 1000, noNaN: true }),
  unit: fc.constantFrom('°C', 'bar', '%', 'mm/s', 'm³/h', 'cm', 'V', 'A', 'kW', 'ppm'),
  status: fc.constantFrom('online', 'offline'),
  timestamp: timestampArb,
  deviceType: fc.constant('sensor'),
})

// Menü öğesi üreteci — tüm roller için olası path'ler
const allMenuPaths = [
  '/admin/dashboard', '/admin/companies', '/admin/devices', '/admin/users',
  '/company/dashboard',
  '/location/dashboard',
  '/user/dashboard',
]

const menuItemArb = fc.constantFrom(...allMenuPaths).map((path) => ({
  path,
  label: path.split('/').pop(),
}))

const menuItemsArb = fc.array(menuItemArb, { minLength: 1, maxLength: 7 }).map((items) => {
  const seen = new Set()
  return items.filter((i) => {
    if (seen.has(i.path)) return false
    seen.add(i.path)
    return true
  })
})

// State üreteci — persist round-trip için
const stateArb = fc.record({
  companies: fc.array(
    fc.record({
      id: fc.integer({ min: 1, max: 100 }),
      displayName: fc.string({ minLength: 1, maxLength: 20 }),
      fullName: fc.string({ minLength: 1, maxLength: 40 }),
      locations: fc.array(
        fc.record({
          id: fc.integer({ min: 1, max: 200 }),
          name: fc.string({ minLength: 1, maxLength: 20 }),
          devices: fc.array(
            fc.record({
              id: deviceIdArb,
              tagName: fc.string({ minLength: 1, maxLength: 15 }),
              value: fc.integer({ min: 0, max: 1000 }),
              unit: fc.constantFrom('°C', 'bar', '%', 'V'),
              status: fc.constantFrom('online', 'offline'),
              timestamp: timestampArb,
            }),
            { minLength: 0, maxLength: 3 }
          ),
        }),
        { minLength: 0, maxLength: 3 }
      ),
    }),
    { minLength: 0, maxLength: 5 }
  ),
  deviceHistory: fc.constant({}),
  ioHistory: fc.constant({}),
})

// ============================================================
// TESTLER
// ============================================================

describe('Feature: scada-ui-professional', () => {
  /**
   * Property 27: Kullanıcı Ağaç Yapısı Gruplama
   * - Her firma altında yalnızca o firmaya atanmış kullanıcılar bulunmalı
   * - Firmaya atanmamış kullanıcılar (companyId: null) ayrı bölümde
   * - Tüm kullanıcılar ya bir firma grubunda ya da unassigned'da olmalı
   *
   * **Validates: Requirements 10.3, 10.4, 10.5**
   */
  describe('Property 27: Kullanıcı Ağaç Yapısı Gruplama', () => {
    it('her firma altında yalnızca o firmaya atanmış kullanıcılar bulunmalı', () => {
      fc.assert(
        fc.property(
          companiesArb.chain((companies) => {
            const companyIds = companies.map((c) => c.id)
            return fc.tuple(
              fc.constant(companies),
              fc.array(userArb(companyIds), { minLength: 0, maxLength: 30 })
            )
          }),
          ([companies, users]) => {
            const { tree, unassigned } = groupUsersByCompany(users, companies)

            // Her firma grubundaki kullanıcılar yalnızca o firmaya ait olmalı
            tree.forEach(({ company, users: groupUsers }) => {
              groupUsers.forEach((u) => {
                expect(u.companyId).toBe(company.id)
              })
            })

            // Atanmamış kullanıcıların companyId'si null olmalı
            unassigned.forEach((u) => {
              expect(u.companyId).toBeNull()
            })

            // Toplam kullanıcı sayısı korunmalı
            const totalGrouped = tree.reduce((sum, g) => sum + g.users.length, 0)
            expect(totalGrouped + unassigned.length).toBe(users.length)
          }
        ),
        { numRuns: 100 }
      )
    })
  })


  /**
   * Property 28: Firma Seçimine Göre Lokasyon Filtreleme
   * - Lokasyon dropdown'ındaki tüm lokasyonlar yalnızca seçilen firmaya ait olmalı
   * - Var olmayan firma seçildiğinde boş dizi dönmeli
   *
   * **Validates: Requirements 10.8**
   */
  describe('Property 28: Firma Seçimine Göre Lokasyon Filtreleme', () => {
    it('dönen tüm lokasyonlar yalnızca seçilen firmaya ait olmalı', () => {
      fc.assert(
        fc.property(companiesArb, (companies) => {
          companies.forEach((company) => {
            const locations = filterLocationsByCompany(companies, company.id)
            // Dönen lokasyonlar, firmanın kendi lokasyonları olmalı
            expect(locations).toEqual(company.locations)
          })
        }),
        { numRuns: 100 }
      )
    })

    it('var olmayan firma ID ile boş dizi dönmeli', () => {
      fc.assert(
        fc.property(
          companiesArb,
          fc.integer({ min: 9000, max: 9999 }),
          (companies, fakeId) => {
            // fakeId'nin gerçek bir firma ID'si olmadığından emin ol
            const exists = companies.some((c) => c.id === fakeId)
            if (exists) return // nadir durum, atla
            const locations = filterLocationsByCompany(companies, fakeId)
            expect(locations).toEqual([])
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Property 30: Sensör Kartı Bilgi Bütünlüğü
   * - Kart bileşeni tag name, değer, birim, Device ID, durum ve son güncelleme içermeli
   *
   * **Validates: Requirements 13.1**
   */
  describe('Property 30: Sensör Kartı Bilgi Bütünlüğü', () => {
    it('çıkarılan kart verisi tüm zorunlu alanları içermeli', () => {
      fc.assert(
        fc.property(sensorDeviceArb, (device) => {
          const cardData = extractSensorCardData(device)

          expect(cardData).toHaveProperty('tagName', device.tagName)
          expect(cardData).toHaveProperty('value', device.value)
          expect(cardData).toHaveProperty('unit', device.unit)
          expect(cardData).toHaveProperty('deviceId', device.id)
          expect(cardData).toHaveProperty('status', device.status)
          expect(cardData).toHaveProperty('lastUpdate', device.timestamp)

          // Durum yalnızca online veya offline olmalı
          expect(['online', 'offline']).toContain(cardData.status)

          // lastUpdate geçerli bir ISO tarih olmalı
          expect(new Date(cardData.lastUpdate).toISOString()).toBe(cardData.lastUpdate)
        }),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Property 31: Sensör Kartı Rol Bazlı Yönlendirme
   * - "İzle" butonu /{rolPrefix}/device/{deviceId} formatında yönlendirme yapmalı
   *
   * **Validates: Requirements 13.3**
   */
  describe('Property 31: Sensör Kartı Rol Bazlı Yönlendirme', () => {
    it('yönlendirme yolu /{rolPrefix}/device/{deviceId} formatında olmalı', () => {
      fc.assert(
        fc.property(roleArb, deviceIdArb, (role, deviceId) => {
          const route = getDeviceRoute(role, deviceId)
          const expectedPrefix = ROLE_PREFIXES[role]

          expect(route).toBe(`${expectedPrefix}/device/${deviceId}`)
          expect(route).toMatch(new RegExp(`^${expectedPrefix.replace('/', '\\/')}\\/device\\/DEV-\\d{3}$`))
        }),
        { numRuns: 100 }
      )
    })

    it('her rol için doğru prefix kullanılmalı', () => {
      fc.assert(
        fc.property(roleArb, deviceIdArb, (role, deviceId) => {
          const route = getDeviceRoute(role, deviceId)

          if (role === 'admin') expect(route).toContain('/admin/')
          else if (role === 'company_manager') expect(route).toContain('/company/')
          else if (role === 'location_manager') expect(route).toContain('/location/')
          else if (role === 'user') expect(route).toContain('/user/')
        }),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Property 32: State Persist Round-Trip
   * - localStorage'a yazılan veri aynı yapıda geri okunmalı
   *
   * **Validates: Requirements 14.5**
   */
  describe('Property 32: State Persist Round-Trip', () => {
    it('JSON serialize/deserialize sonrası veri aynı yapıda olmalı', () => {
      fc.assert(
        fc.property(stateArb, (state) => {
          const restored = persistRoundTrip(state)
          expect(restored).toEqual(state)
        }),
        { numRuns: 100 }
      )
    })

    it('round-trip sonrası companies dizisi korunmalı', () => {
      fc.assert(
        fc.property(stateArb, (state) => {
          const restored = persistRoundTrip(state)
          expect(restored.companies).toHaveLength(state.companies.length)
          state.companies.forEach((company, i) => {
            expect(restored.companies[i].id).toBe(company.id)
            expect(restored.companies[i].displayName).toBe(company.displayName)
            expect(restored.companies[i].locations).toHaveLength(company.locations.length)
          })
        }),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Property 33: Rol Bazlı Menü Öğeleri
   * - Sidebar menü öğeleri yalnızca rolün erişim yetkisi olan sayfalara ait olmalı
   *
   * **Validates: Requirements 15.6**
   */
  describe('Property 33: Rol Bazlı Menü Öğeleri', () => {
    it('filtrelenen menü öğeleri yalnızca rolün yetkili olduğu path\'leri içermeli', () => {
      fc.assert(
        fc.property(menuItemsArb, roleArb, (menuItems, role) => {
          const filtered = filterMenuItemsByRole(menuItems, role)
          const allowed = ROLE_ALLOWED_PATHS[role]

          // Dönen her öğe, izin verilen path'lerden biri olmalı
          filtered.forEach((item) => {
            expect(allowed).toContain(item.path)
          })
        }),
        { numRuns: 100 }
      )
    })

    it('yetkili path\'e sahip hiçbir menü öğesi dışlanmamalı', () => {
      fc.assert(
        fc.property(menuItemsArb, roleArb, (menuItems, role) => {
          const filtered = filterMenuItemsByRole(menuItems, role)
          const allowed = ROLE_ALLOWED_PATHS[role]

          // Orijinal listede yetkili olan her öğe, sonuçta bulunmalı
          menuItems.forEach((item) => {
            if (allowed.includes(item.path)) {
              expect(filtered).toContainEqual(item)
            }
          })
        }),
        { numRuns: 100 }
      )
    })

    it('admin tüm admin menü öğelerine erişebilmeli, diğer roller erişememeli', () => {
      fc.assert(
        fc.property(menuItemsArb, (menuItems) => {
          const adminFiltered = filterMenuItemsByRole(menuItems, 'admin')
          const userFiltered = filterMenuItemsByRole(menuItems, 'user')

          // User rolü admin path'lerine erişememeli
          userFiltered.forEach((item) => {
            expect(item.path).not.toMatch(/^\/admin\//)
          })

          // Admin rolü admin path'lerine erişebilmeli
          const adminPaths = menuItems.filter((i) => i.path.startsWith('/admin/'))
          adminPaths.forEach((item) => {
            expect(adminFiltered).toContainEqual(item)
          })
        }),
        { numRuns: 100 }
      )
    })
  })
})
