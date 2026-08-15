import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

/**
 * Property 35: I/O Nokta Geçmiş Tarih Filtresi
 * Filtreleme sonrası tüm kayıtların timestamp değeri belirtilen aralık içinde olmalı.
 *
 * IOPointHistoryPanel bileşenindeki filtreleme mantığının saf fonksiyon replikası
 * üzerinden property-based test yapılır.
 *
 * **Validates: Gereksinimler 19.5**
 */

// --- IOPointHistoryPanel'deki filtreleme mantığının saf replikası ---
function filterByDateRange(records, filterFrom, filterTo) {
  let data = [...records]
  if (filterFrom) data = data.filter((r) => new Date(r.timestamp) >= new Date(filterFrom))
  if (filterTo) data = data.filter((r) => new Date(r.timestamp) <= new Date(filterTo))
  return data
}

// --- Üreteçler (Arbitraries) ---
const MIN_TS = new Date('2024-01-01').getTime()
const MAX_TS = new Date('2026-12-31').getTime()

// Güvenli tarih üreteci — milisaniye bazlı, geçersiz tarih riski yok
const safeTimestampArb = fc.integer({ min: MIN_TS, max: MAX_TS }).map((ms) => new Date(ms))

const ioRecordArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 30 }),
  value: fc.oneof(fc.constant('0'), fc.constant('1'), fc.integer({ min: 0, max: 65535 }).map(String)),
  timestamp: safeTimestampArb.map((d) => d.toISOString()),
})

// İki tarih üretip küçük olanı from, büyük olanı to olarak sıralar
const dateRangeArb = fc.tuple(safeTimestampArb, safeTimestampArb).map(([a, b]) => {
  const sorted = a <= b ? [a, b] : [b, a]
  return { from: sorted[0].toISOString(), to: sorted[1].toISOString() }
})

describe('Feature: scada-ui-professional — I/O Nokta Geçmiş Tarih Filtresi', () => {
  /**
   * Property 35: I/O Nokta Geçmiş Tarih Filtresi
   * Herhangi bir kayıt dizisi ve tarih aralığı için, filtreleme sonrası
   * dönen tüm kayıtların timestamp değeri [filterFrom, filterTo] aralığında olmalı.
   * **Validates: Gereksinimler 19.5**
   */
  it('Property 35: Tarih filtresi sonrası tüm kayıtlar belirtilen aralık içinde olmalı', () => {
    fc.assert(
      fc.property(
        fc.array(ioRecordArb, { minLength: 0, maxLength: 30 }),
        dateRangeArb,
        (records, range) => {
          const result = filterByDateRange(records, range.from, range.to)

          const fromDate = new Date(range.from)
          const toDate = new Date(range.to)

          // 1. Dönen her kayıt aralık içinde olmalı
          for (const r of result) {
            const ts = new Date(r.timestamp)
            expect(ts.getTime()).toBeGreaterThanOrEqual(fromDate.getTime())
            expect(ts.getTime()).toBeLessThanOrEqual(toDate.getTime())
          }

          // 2. Aralık dışındaki hiçbir kayıt sonuçta olmamalı
          const resultIds = new Set(result.map((r) => r.id))
          for (const r of records) {
            const ts = new Date(r.timestamp)
            if (ts < fromDate || ts > toDate) {
              expect(resultIds.has(r.id)).toBe(false)
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 35 (ek): Filtre uygulanmadığında tüm kayıtlar dönmeli
   * filterFrom ve filterTo boş string olduğunda filtreleme yapılmaz.
   * **Validates: Gereksinimler 19.5**
   */
  it('Property 35: Filtre boş olduğunda tüm kayıtlar dönmeli', () => {
    fc.assert(
      fc.property(
        fc.array(ioRecordArb, { minLength: 0, maxLength: 30 }),
        (records) => {
          const result = filterByDateRange(records, '', '')
          expect(result).toHaveLength(records.length)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 35 (ek): Yalnızca filterFrom uygulandığında, tüm sonuçlar >= filterFrom olmalı
   * **Validates: Gereksinimler 19.5**
   */
  it('Property 35: Yalnızca başlangıç filtresi uygulandığında sonuçlar >= başlangıç olmalı', () => {
    fc.assert(
      fc.property(
        fc.array(ioRecordArb, { minLength: 0, maxLength: 30 }),
        safeTimestampArb.map((d) => d.toISOString()),
        (records, fromStr) => {
          const result = filterByDateRange(records, fromStr, '')
          const fromDate = new Date(fromStr)

          for (const r of result) {
            expect(new Date(r.timestamp).getTime()).toBeGreaterThanOrEqual(fromDate.getTime())
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 35 (ek): Yalnızca filterTo uygulandığında, tüm sonuçlar <= filterTo olmalı
   * **Validates: Gereksinimler 19.5**
   */
  it('Property 35: Yalnızca bitiş filtresi uygulandığında sonuçlar <= bitiş olmalı', () => {
    fc.assert(
      fc.property(
        fc.array(ioRecordArb, { minLength: 0, maxLength: 30 }),
        safeTimestampArb.map((d) => d.toISOString()),
        (records, toStr) => {
          const result = filterByDateRange(records, '', toStr)
          const toDate = new Date(toStr)

          for (const r of result) {
            expect(new Date(r.timestamp).getTime()).toBeLessThanOrEqual(toDate.getTime())
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
