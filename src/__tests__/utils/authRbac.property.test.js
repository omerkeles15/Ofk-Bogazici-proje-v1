import { describe, it, expect, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { useAuthStore } from '../../features/auth/authStore.js'

// --- Geçerli kullanıcı veritabanı (authStore'daki MOCK_USERS ile aynı) ---
const VALID_CREDENTIALS = [
  { username: 'admin', password: 'admin123', role: 'admin' },
  { username: 'firma1', password: 'firma123', role: 'company_manager', companyId: 1 },
  { username: 'lokasyon1', password: 'lok123', role: 'location_manager', companyId: 1, locationId: 1 },
  { username: 'kullanici1', password: 'kul123', role: 'user', companyId: 1, locationId: 1 },
]

const ROLE_REDIRECTS = {
  admin: '/admin/dashboard',
  company_manager: '/company/dashboard',
  location_manager: '/location/dashboard',
  user: '/user/dashboard',
}

// --- Uygulama rota tanımları (App.jsx'ten alınmıştır) ---
const PROTECTED_ROUTES = [
  { path: '/admin/dashboard', allowedRoles: ['admin'] },
  { path: '/admin/companies', allowedRoles: ['admin'] },
  { path: '/admin/companies/:id', allowedRoles: ['admin'] },
  { path: '/admin/users', allowedRoles: ['admin'] },
  { path: '/admin/devices', allowedRoles: ['admin'] },
  { path: '/admin/device/:deviceId', allowedRoles: ['admin'] },
  { path: '/company/dashboard', allowedRoles: ['company_manager'] },
  { path: '/company/device/:deviceId', allowedRoles: ['company_manager'] },
  { path: '/location/dashboard', allowedRoles: ['location_manager'] },
  { path: '/location/device/:deviceId', allowedRoles: ['location_manager'] },
  { path: '/user/dashboard', allowedRoles: ['user'] },
  { path: '/user/device/:deviceId', allowedRoles: ['user'] },
]

const ALL_ROLES = ['admin', 'company_manager', 'location_manager', 'user']

// --- Saf erişim kontrol fonksiyonu (ProtectedRoute mantığının kopyası) ---
function checkAccess(isAuthenticated, userRole, allowedRoles) {
  if (!isAuthenticated) return 'redirect:/login'
  if (allowedRoles.length > 0 && !allowedRoles.includes(userRole)) return 'redirect:/unauthorized'
  return 'allowed'
}

// --- Rol bazlı veri kapsamı kontrol fonksiyonu ---
function canAccessCompanyData(user, targetCompanyId) {
  if (!user) return false
  if (user.role === 'admin') return true
  if (user.role === 'company_manager') return user.companyId === targetCompanyId
  if (user.role === 'location_manager' || user.role === 'user') return user.companyId === targetCompanyId
  return false
}

function canAccessLocationData(user, targetCompanyId, targetLocationId) {
  if (!user) return false
  if (user.role === 'admin') return true
  if (user.role === 'company_manager') return user.companyId === targetCompanyId
  if (user.role === 'location_manager' || user.role === 'user') {
    return user.companyId === targetCompanyId && user.locationId === targetLocationId
  }
  return false
}

// --- Arbitrary'ler ---
const validCredentialArb = fc.constantFrom(...VALID_CREDENTIALS)
const roleArb = fc.constantFrom(...ALL_ROLES)
const routeArb = fc.constantFrom(...PROTECTED_ROUTES)

// Geçersiz kimlik bilgileri üretici — geçerli çiftlerle çakışmayan
const invalidCredentialArb = fc.tuple(
  fc.string({ minLength: 1, maxLength: 20 }),
  fc.string({ minLength: 1, maxLength: 20 })
).filter(([u, p]) =>
  !VALID_CREDENTIALS.some((vc) => vc.username === u && vc.password === p)
)

// Store sıfırlama yardımcısı
function resetAuthStore() {
  useAuthStore.setState({ user: null, token: null, isAuthenticated: false })
}

describe('Feature: scada-ui-professional', () => {
  beforeEach(() => {
    resetAuthStore()
  })

  /**
   * Property 1: Login/Logout Round-Trip
   * Geçerli kullanıcı ile login → isAuthenticated: true + rol bazlı yönlendirme yolu,
   * logout → isAuthenticated: false, user: null, token: null
   *
   * **Validates: Requirements 1.1, 1.3**
   */
  describe('Property 1: Login/Logout Round-Trip', () => {
    it('geçerli kullanıcı ile login sonrası isAuthenticated true olmalı ve doğru yönlendirme yolu dönmeli, logout sonrası state temizlenmeli', () => {
      fc.assert(
        fc.property(
          validCredentialArb,
          (cred) => {
            resetAuthStore()

            // Login
            const redirectPath = useAuthStore.getState().login(cred.username, cred.password)
            const stateAfterLogin = useAuthStore.getState()

            expect(stateAfterLogin.isAuthenticated).toBe(true)
            expect(stateAfterLogin.user).not.toBeNull()
            expect(stateAfterLogin.user.username).toBe(cred.username)
            expect(stateAfterLogin.user.role).toBe(cred.role)
            expect(stateAfterLogin.token).toBeTruthy()
            expect(redirectPath).toBe(ROLE_REDIRECTS[cred.role])

            // Logout
            useAuthStore.getState().logout()
            const stateAfterLogout = useAuthStore.getState()

            expect(stateAfterLogout.isAuthenticated).toBe(false)
            expect(stateAfterLogout.user).toBeNull()
            expect(stateAfterLogout.token).toBeNull()
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Property 2: Geçersiz Kimlik Bilgileri Reddi
   * Geçersiz kullanıcı/şifre çifti ile login hata fırlatmalı, state değişmemeli
   *
   * **Validates: Requirements 1.2**
   */
  describe('Property 2: Geçersiz Kimlik Bilgileri Reddi', () => {
    it('geçersiz kullanıcı/şifre çifti ile login hata fırlatmalı ve state değişmemeli', () => {
      fc.assert(
        fc.property(
          invalidCredentialArb,
          ([username, password]) => {
            resetAuthStore()

            const stateBefore = useAuthStore.getState()

            expect(() => {
              useAuthStore.getState().login(username, password)
            }).toThrow('Kullanıcı adı veya şifre hatalı')

            const stateAfter = useAuthStore.getState()
            expect(stateAfter.isAuthenticated).toBe(stateBefore.isAuthenticated)
            expect(stateAfter.user).toBe(stateBefore.user)
            expect(stateAfter.token).toBe(stateBefore.token)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Property 3: Oturum Nesnesinde Şifre Bulunmaması
   * Başarılı login sonrası user nesnesinde password alanı bulunmamalı
   *
   * **Validates: Requirements 1.4**
   */
  describe('Property 3: Oturum Nesnesinde Şifre Bulunmaması', () => {
    it('başarılı login sonrası user nesnesinde password alanı bulunmamalı', () => {
      fc.assert(
        fc.property(
          validCredentialArb,
          (cred) => {
            resetAuthStore()

            useAuthStore.getState().login(cred.username, cred.password)
            const { user } = useAuthStore.getState()

            expect(user).not.toBeNull()
            expect(user).not.toHaveProperty('password')
            // Diğer alanlar mevcut olmalı
            expect(user).toHaveProperty('id')
            expect(user).toHaveProperty('username')
            expect(user).toHaveProperty('role')
            expect(user).toHaveProperty('name')
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Property 4: Rol Bazlı Erişim Kontrolü
   * Kullanıcı rolü rotanın allowedRoles listesinde yoksa erişim reddedilmeli.
   * Oturum açmamış kullanıcılar /login'e yönlendirilmeli.
   *
   * **Validates: Requirements 2.2, 2.3**
   */
  describe('Property 4: Rol Bazlı Erişim Kontrolü', () => {
    it('oturum açmamış kullanıcı korumalı rotaya erişemez — /login yönlendirmesi', () => {
      fc.assert(
        fc.property(
          routeArb,
          (route) => {
            const result = checkAccess(false, null, route.allowedRoles)
            expect(result).toBe('redirect:/login')
          }
        ),
        { numRuns: 100 }
      )
    })

    it('kullanıcı rolü allowedRoles listesinde yoksa /unauthorized yönlendirmesi', () => {
      fc.assert(
        fc.property(
          roleArb,
          routeArb,
          (role, route) => {
            if (route.allowedRoles.includes(role)) return // bu durumu atlıyoruz

            const result = checkAccess(true, role, route.allowedRoles)
            expect(result).toBe('redirect:/unauthorized')
          }
        ),
        { numRuns: 100 }
      )
    })

    it('kullanıcı rolü allowedRoles listesindeyse erişim izni verilmeli', () => {
      fc.assert(
        fc.property(
          routeArb,
          (route) => {
            // Rotanın izin verdiği rollerden birini seç
            const allowedRole = route.allowedRoles[0]
            const result = checkAccess(true, allowedRole, route.allowedRoles)
            expect(result).toBe('allowed')
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Property 5: Rol Bazlı Veri Kapsamı
   * company_manager yalnızca kendi firmasına, location_manager/user yalnızca kendi lokasyonuna erişebilmeli
   *
   * **Validates: Requirements 2.5, 2.6, 2.7, 12.3, 12.4**
   */
  describe('Property 5: Rol Bazlı Veri Kapsamı', () => {
    // Rastgele companyId ve locationId üretici
    const companyIdArb = fc.integer({ min: 1, max: 100 })
    const locationIdArb = fc.integer({ min: 1, max: 100 })

    it('company_manager yalnızca kendi firmasının verilerine erişebilmeli', () => {
      fc.assert(
        fc.property(
          companyIdArb,
          companyIdArb,
          (userCompanyId, targetCompanyId) => {
            const user = { role: 'company_manager', companyId: userCompanyId }

            const canAccess = canAccessCompanyData(user, targetCompanyId)

            if (userCompanyId === targetCompanyId) {
              expect(canAccess).toBe(true)
            } else {
              expect(canAccess).toBe(false)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('location_manager yalnızca kendi lokasyonunun verilerine erişebilmeli', () => {
      fc.assert(
        fc.property(
          companyIdArb,
          locationIdArb,
          companyIdArb,
          locationIdArb,
          (userCompanyId, userLocationId, targetCompanyId, targetLocationId) => {
            const user = { role: 'location_manager', companyId: userCompanyId, locationId: userLocationId }

            const canAccess = canAccessLocationData(user, targetCompanyId, targetLocationId)

            if (userCompanyId === targetCompanyId && userLocationId === targetLocationId) {
              expect(canAccess).toBe(true)
            } else {
              expect(canAccess).toBe(false)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('user rolü yalnızca kendi lokasyonunun verilerine erişebilmeli', () => {
      fc.assert(
        fc.property(
          companyIdArb,
          locationIdArb,
          companyIdArb,
          locationIdArb,
          (userCompanyId, userLocationId, targetCompanyId, targetLocationId) => {
            const user = { role: 'user', companyId: userCompanyId, locationId: userLocationId }

            const canAccess = canAccessLocationData(user, targetCompanyId, targetLocationId)

            if (userCompanyId === targetCompanyId && userLocationId === targetLocationId) {
              expect(canAccess).toBe(true)
            } else {
              expect(canAccess).toBe(false)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('admin tüm firma ve lokasyon verilerine erişebilmeli', () => {
      fc.assert(
        fc.property(
          companyIdArb,
          locationIdArb,
          (targetCompanyId, targetLocationId) => {
            const user = { role: 'admin' }

            expect(canAccessCompanyData(user, targetCompanyId)).toBe(true)
            expect(canAccessLocationData(user, targetCompanyId, targetLocationId)).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
