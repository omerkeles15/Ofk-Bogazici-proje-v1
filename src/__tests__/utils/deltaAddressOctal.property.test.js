import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { getDeltaXAddresses, getDeltaYAddresses } from '../../features/device/deviceCatalog.js'

/**
 * Property 15: Delta DVP Oktal Adres Üretimi
 * getDeltaXAddresses(count) tam olarak count adet adres üretmeli,
 * hiçbir adres oktal olmayan rakam içermemeli.
 * Aynı kural getDeltaYAddresses için de geçerlidir.
 *
 * **Validates: Gereksinimler 7.9, 7.10**
 */

// Oktal olmayan rakam kontrolü: adresin sayısal kısmında 8 veya 9 bulunmamalı
function hasNonOctalDigit(address) {
  // Prefix'i (X veya Y) kaldır, kalan sayısal kısmı kontrol et
  const numericPart = address.replace(/^[XY]/, '')
  return /[89]/.test(numericPart)
}

describe('Property 15: Delta DVP Oktal Adres Üretimi', () => {
  it('getDeltaXAddresses(count) tam olarak count adet adres üretmeli ve hiçbir adres oktal olmayan rakam içermemeli', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 64 }),
        (count) => {
          const addresses = getDeltaXAddresses(count)

          // Tam olarak count adet adres üretilmeli
          expect(addresses).toHaveLength(count)

          // Her adres X prefix'i ile başlamalı
          addresses.forEach((addr) => {
            expect(addr).toMatch(/^X\d+$/)
          })

          // Hiçbir adres oktal olmayan rakam (8, 9) içermemeli
          addresses.forEach((addr) => {
            expect(hasNonOctalDigit(addr)).toBe(false)
          })
        }
      ),
      { numRuns: 100 }
    )
  })

  it('getDeltaYAddresses(count) tam olarak count adet adres üretmeli ve hiçbir adres oktal olmayan rakam içermemeli', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 64 }),
        (count) => {
          const addresses = getDeltaYAddresses(count)

          // Tam olarak count adet adres üretilmeli
          expect(addresses).toHaveLength(count)

          // Her adres Y prefix'i ile başlamalı
          addresses.forEach((addr) => {
            expect(addr).toMatch(/^Y\d+$/)
          })

          // Hiçbir adres oktal olmayan rakam (8, 9) içermemeli
          addresses.forEach((addr) => {
            expect(hasNonOctalDigit(addr)).toBe(false)
          })
        }
      ),
      { numRuns: 100 }
    )
  })
})
