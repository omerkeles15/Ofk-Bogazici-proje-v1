import { describe, it, expect, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { useUserStore } from '../../features/users/userStore.js'

/**
 * useFormValidation doğrulama mantığının saf fonksiyon kopyası.
 * React hook bağımlılığı olmadan property testlerinde kullanılır.
 */
function validateForm(rules, formData) {
  const errors = {}
  let allValid = true

  for (const [field, rule] of Object.entries(rules)) {
    const error = rule(formData[field])
    if (error) {
      errors[field] = error
      allValid = false
    }
  }

  return { errors, isValid: allValid }
}

// --- Ortak doğrulama kuralları (uygulamadaki ile aynı mantık) ---
const companyRules = {
  displayName: (v) => (!v || !v.trim() ? 'Görünen ad zorunludur' : null),
  fullName: (v) => (!v || !v.trim() ? 'Tam ad zorunludur' : null),
}

const userRules = {
  username: (v) => (!v || !v.trim() ? 'Kullanıcı adı zorunludur' : null),
  name: (v) => (!v || !v.trim() ? 'Ad soyad zorunludur' : null),
}

const locationRules = {
  name: (v) => (!v || !v.trim() ? 'Lokasyon adı zorunludur' : null),
}

// --- Arbitrary'ler ---

// Boş veya sadece whitespace string üretici
const emptyOrWhitespaceArb = fc.oneof(
  fc.constant(''),
  fc.constant(null),
  fc.constant(undefined),
  fc.integer({ min: 1, max: 20 }).map((n) => ' '.repeat(n)),
  fc.integer({ min: 1, max: 5 }).chain((n) =>
    fc.array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: n, maxLength: n }).map((arr) => arr.join(''))
  )
)

// Geçerli (boş olmayan, trim sonrası en az 1 karakter) string üretici
const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 50 }).filter(
  (s) => s.trim().length > 0
)

// Benzersiz kullanıcı adı üretici (alfanumerik, 3-20 karakter)
const usernameArb = fc.array(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'),
  { minLength: 3, maxLength: 20 }
).map((arr) => arr.join(''))

describe('Feature: scada-ui-professional', () => {
  /**
   * Property 9: Zorunlu Alan Doğrulama
   * Boş string veya whitespace ile ekleme/düzenleme reddedilmeli, state değişmemeli.
   *
   * **Validates: Gereksinimler 3.5, 4.5, 16.1**
   */
  describe('Property 9: Zorunlu Alan Doğrulama', () => {
    it('firma: boş/whitespace displayName veya fullName ile doğrulama reddedilmelidir', () => {
      fc.assert(
        fc.property(
          emptyOrWhitespaceArb,
          emptyOrWhitespaceArb,
          (displayName, fullName) => {
            const { errors, isValid } = validateForm(companyRules, { displayName, fullName })
            expect(isValid).toBe(false)
            expect(errors.displayName).toBeTruthy()
            expect(errors.fullName).toBeTruthy()
          }
        ),
        { numRuns: 100 }
      )
    })

    it('lokasyon: boş/whitespace name ile doğrulama reddedilmelidir', () => {
      fc.assert(
        fc.property(
          emptyOrWhitespaceArb,
          (name) => {
            const { errors, isValid } = validateForm(locationRules, { name })
            expect(isValid).toBe(false)
            expect(errors.name).toBeTruthy()
          }
        ),
        { numRuns: 100 }
      )
    })

    it('kullanıcı: boş/whitespace username veya name ile doğrulama reddedilmelidir', () => {
      fc.assert(
        fc.property(
          emptyOrWhitespaceArb,
          emptyOrWhitespaceArb,
          (username, name) => {
            const { errors, isValid } = validateForm(userRules, { username, name })
            expect(isValid).toBe(false)
            expect(errors.username).toBeTruthy()
            expect(errors.name).toBeTruthy()
          }
        ),
        { numRuns: 100 }
      )
    })

    it('geçerli (boş olmayan) değerler ile doğrulama kabul edilmelidir', () => {
      fc.assert(
        fc.property(
          nonEmptyStringArb,
          nonEmptyStringArb,
          (displayName, fullName) => {
            const { errors, isValid } = validateForm(companyRules, { displayName, fullName })
            expect(isValid).toBe(true)
            expect(Object.keys(errors)).toHaveLength(0)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Property 26: Kullanıcı Adı Benzersizlik Kontrolü
   * Mevcut kullanıcı adı ile ekleme reddedilmeli, hata mesajı dönmeli.
   * Mevcut kullanıcı listesi değişmemelidir.
   *
   * **Validates: Gereksinimler 10.2, 16.2**
   */
  describe('Property 26: Kullanıcı Adı Benzersizlik Kontrolü', () => {
    beforeEach(() => {
      useUserStore.setState({ users: [] })
    })

    it('aynı kullanıcı adı ile ekleme reddedilmeli ve hata fırlatmalıdır', () => {
      fc.assert(
        fc.property(
          usernameArb,
          nonEmptyStringArb,
          (username, name) => {
            // Store'u sıfırla
            useUserStore.setState({ users: [] })

            const store = useUserStore.getState()

            // İlk kullanıcıyı ekle — başarılı olmalı
            store.addUser({ username, name, role: 'user', companyId: null, locationId: null })

            const usersAfterFirst = useUserStore.getState().users
            expect(usersAfterFirst).toHaveLength(1)
            expect(usersAfterFirst[0].username).toBe(username)

            // Aynı kullanıcı adı ile tekrar ekleme — hata fırlatmalı
            expect(() => {
              useUserStore.getState().addUser({ username, name: 'Başka İsim', role: 'admin', companyId: null, locationId: null })
            }).toThrow()

            // Kullanıcı listesi değişmemeli
            const usersAfterDuplicate = useUserStore.getState().users
            expect(usersAfterDuplicate).toHaveLength(1)
            expect(usersAfterDuplicate[0].username).toBe(username)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('farklı kullanıcı adları ile ekleme başarılı olmalıdır', () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(usernameArb, { minLength: 2, maxLength: 10 }),
          (usernames) => {
            useUserStore.setState({ users: [] })

            // Her benzersiz kullanıcı adı ile ekleme başarılı olmalı
            usernames.forEach((username) => {
              useUserStore.getState().addUser({
                username,
                name: `User ${username}`,
                role: 'user',
                companyId: null,
                locationId: null,
              })
            })

            const users = useUserStore.getState().users
            expect(users).toHaveLength(usernames.length)

            // Tüm kullanıcı adları benzersiz olmalı
            const storedUsernames = users.map((u) => u.username)
            expect(new Set(storedUsernames).size).toBe(usernames.length)
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
