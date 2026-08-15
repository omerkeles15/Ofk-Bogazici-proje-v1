import { describe, it, expect, beforeEach } from 'vitest'
import fc from 'fast-check'
import { useCompanyStore } from '../../features/company/companyStore.js'

/**
 * Property 34: I/O Nokta Geçmiş Kayıt Bütünlüğü
 * appendIOHistory çağrıldığında yeni kayıt eklenmeli, mevcut kayıtlar korunmalı.
 *
 * Property 36: I/O Nokta Geçmiş Silme
 * clearIOHistory çağrıldığında yalnızca o noktanın geçmişi silinmeli, diğerleri etkilenmemeli.
 *
 * **Validates: Gereksinimler 19.1, 19.7, 19.10**
 */

// Yardımcı: geçerli deviceId üreteci
const deviceIdArb = fc.stringMatching(/^DEV-\d{3}$/)

// Yardımcı: geçerli I/O adresi üreteci (X0-X7, Y0-Y5, AI0-AI3, AO0-AO3, D0-D100)
const ioAddressArb = fc.oneof(
  fc.integer({ min: 0, max: 7 }).map((n) => `X${n}`),
  fc.integer({ min: 0, max: 5 }).map((n) => `Y${n}`),
  fc.integer({ min: 0, max: 3 }).map((n) => `AI${n}`),
  fc.integer({ min: 0, max: 3 }).map((n) => `AO${n}`),
  fc.integer({ min: 0, max: 100 }).map((n) => `D${n}`)
)

// Yardımcı: geçerli IOHistoryRecord üreteci
const MIN_TS = new Date('2024-01-01').getTime()
const MAX_TS = new Date('2026-12-31').getTime()

const ioRecordArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 30 }),
  value: fc.oneof(fc.constant('0'), fc.constant('1'), fc.integer({ min: 0, max: 65535 }).map(String)),
  timestamp: fc.integer({ min: MIN_TS, max: MAX_TS }).map((ms) => new Date(ms).toISOString()),
})

describe('Feature: scada-ui-professional — I/O Nokta Geçmiş Property Testleri', () => {
  beforeEach(() => {
    useCompanyStore.setState({ ioHistory: {} })
  })

  /**
   * Property 34: I/O Nokta Geçmiş Kayıt Bütünlüğü
   * appendIOHistory çağrıldığında:
   * 1. Yeni kayıt dizinin sonuna eklenmeli
   * 2. Mevcut kayıtlar aynen korunmalı
   * **Validates: Gereksinimler 19.1, 19.7**
   */
  it('Property 34: appendIOHistory yeni kayıt eklemeli ve mevcut kayıtları korumalı', () => {
    fc.assert(
      fc.property(
        deviceIdArb,
        ioAddressArb,
        fc.array(ioRecordArb, { minLength: 0, maxLength: 10 }),
        ioRecordArb,
        (deviceId, address, existingRecords, newRecord) => {
          // Başlangıç durumunu ayarla — mevcut kayıtları yerleştir
          const key = `${deviceId}:${address}`
          useCompanyStore.setState({ ioHistory: { [key]: [...existingRecords] } })

          const beforeState = useCompanyStore.getState().ioHistory[key]
          const beforeLength = beforeState.length

          // Yeni kayıt ekle
          useCompanyStore.getState().appendIOHistory(deviceId, address, newRecord)

          const afterState = useCompanyStore.getState().ioHistory[key]

          // 1. Dizi uzunluğu 1 artmalı
          expect(afterState).toHaveLength(beforeLength + 1)

          // 2. Mevcut kayıtlar korunmalı (ilk N eleman aynı kalmalı)
          for (let i = 0; i < beforeLength; i++) {
            expect(afterState[i]).toEqual(existingRecords[i])
          }

          // 3. Son eleman yeni kayıt olmalı
          expect(afterState[afterState.length - 1]).toEqual(newRecord)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 36: I/O Nokta Geçmiş Silme İzolasyonu
   * clearIOHistory çağrıldığında:
   * 1. Hedef noktanın geçmişi boş dizi olmalı
   * 2. Diğer noktaların geçmişi etkilenmemeli
   * **Validates: Gereksinimler 19.10**
   */
  it('Property 36: clearIOHistory yalnızca hedef noktanın geçmişini silmeli, diğerlerini etkilememeli', () => {
    fc.assert(
      fc.property(
        deviceIdArb,
        ioAddressArb,
        ioAddressArb,
        fc.array(ioRecordArb, { minLength: 1, maxLength: 5 }),
        fc.array(ioRecordArb, { minLength: 1, maxLength: 5 }),
        (deviceId, targetAddress, otherAddress, targetRecords, otherRecords) => {
          // Farklı adresler olmasını garanti et — aynıysa testi atla
          fc.pre(targetAddress !== otherAddress)

          const targetKey = `${deviceId}:${targetAddress}`
          const otherKey = `${deviceId}:${otherAddress}`

          // Başlangıç durumu: iki farklı noktada kayıtlar var
          useCompanyStore.setState({
            ioHistory: {
              [targetKey]: [...targetRecords],
              [otherKey]: [...otherRecords],
            },
          })

          // Hedef noktanın geçmişini sil
          useCompanyStore.getState().clearIOHistory(deviceId, targetAddress)

          const state = useCompanyStore.getState().ioHistory

          // 1. Hedef noktanın geçmişi boş dizi olmalı
          expect(state[targetKey]).toEqual([])

          // 2. Diğer noktanın geçmişi aynen korunmalı
          expect(state[otherKey]).toEqual(otherRecords)
        }
      ),
      { numRuns: 100 }
    )
  })
})
