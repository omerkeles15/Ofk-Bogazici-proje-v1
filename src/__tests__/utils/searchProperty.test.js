import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { renderHook } from './hookTestHelper.js'
import { useSearch } from '../../hooks/useSearch.js'

/**
 * useSearch hook'unun saf filtreleme mantığını doğrudan çoğaltır.
 * React hook bağımlılığı olmadan property testlerinde kullanılır.
 */
function filterItems(items, searchFields, query) {
  if (!query || !query.trim()) return items
  const lowerQuery = query.toLowerCase().trim()
  return items.filter((item) =>
    searchFields.some((field) => {
      const value = item[field]
      if (value == null) return false
      return String(value).toLowerCase().includes(lowerQuery)
    })
  )
}

// Rastgele kayıt üretici — her kayıtta name, deviceId, company alanları var
const itemArb = fc.record({
  id: fc.integer({ min: 1, max: 100000 }),
  name: fc.string({ minLength: 0, maxLength: 30 }),
  deviceId: fc.string({ minLength: 0, maxLength: 15 }),
  company: fc.string({ minLength: 0, maxLength: 30 }),
})

const itemsArb = fc.array(itemArb, { minLength: 0, maxLength: 50 })
const searchFields = ['name', 'deviceId', 'company']

describe('Feature: scada-ui-professional', () => {
  /**
   * Property 29: Arama/Filtreleme Doğruluğu
   * - Boş arama tüm kayıtları döndürmeli
   * - Boş olmayan arama ile dönen her kayıt arama metnini (case-insensitive) içermeli
   * - Eşleşen hiçbir kayıt sonuçlardan dışlanmamalı
   *
   * **Validates: Gereksinimler 11.1, 11.2, 11.3**
   */
  describe('Property 29: Arama/Filtreleme Doğruluğu', () => {
    it('boş arama metni tüm kayıtları döndürmelidir', () => {
      fc.assert(
        fc.property(itemsArb, (items) => {
          const result = filterItems(items, searchFields, '')
          expect(result).toHaveLength(items.length)
          expect(result).toEqual(items)
        }),
        { numRuns: 100 }
      )
    })

    it('boş olmayan arama ile dönen her kayıt, arama metnini en az bir alanda (case-insensitive) içermelidir', () => {
      fc.assert(
        fc.property(
          itemsArb,
          fc.string({ minLength: 1, maxLength: 10 }),
          (items, query) => {
            const result = filterItems(items, searchFields, query)
            const lowerQuery = query.toLowerCase().trim()

            // Eğer query sadece boşluksa, tüm kayıtlar dönmeli
            if (!lowerQuery) {
              expect(result).toHaveLength(items.length)
              return
            }

            // Dönen her kayıt, en az bir alanda arama metnini içermeli
            result.forEach((item) => {
              const matchesAnyField = searchFields.some((field) => {
                const value = item[field]
                if (value == null) return false
                return String(value).toLowerCase().includes(lowerQuery)
              })
              expect(matchesAnyField).toBe(true)
            })
          }
        ),
        { numRuns: 100 }
      )
    })

    it('eşleşen hiçbir kayıt sonuçlardan dışlanmamalıdır (tamlık)', () => {
      fc.assert(
        fc.property(
          itemsArb,
          fc.string({ minLength: 1, maxLength: 10 }),
          (items, query) => {
            const result = filterItems(items, searchFields, query)
            const lowerQuery = query.toLowerCase().trim()

            if (!lowerQuery) {
              expect(result).toHaveLength(items.length)
              return
            }

            // Orijinal listede eşleşen her kayıt, sonuçlarda bulunmalı
            items.forEach((item) => {
              const shouldMatch = searchFields.some((field) => {
                const value = item[field]
                if (value == null) return false
                return String(value).toLowerCase().includes(lowerQuery)
              })
              if (shouldMatch) {
                expect(result).toContainEqual(item)
              }
            })
          }
        ),
        { numRuns: 100 }
      )
    })

    it('hook ile saf fonksiyon aynı sonucu üretmelidir (tutarlılık)', () => {
      fc.assert(
        fc.property(
          itemsArb,
          fc.oneof(fc.constant(''), fc.string({ minLength: 1, maxLength: 10 })),
          (items, query) => {
            const hookResult = renderHook(() => useSearch(items, searchFields, query))
            const pureResult = filterItems(items, searchFields, query)
            expect(hookResult.result).toEqual(pureResult)
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
