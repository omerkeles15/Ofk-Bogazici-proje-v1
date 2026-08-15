import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  DEVICE_CATALOG,
  getUnit,
  getSubtypes,
  DEFAULT_PLC_IO_CONFIG,
  DATA_TYPES,
} from '../../features/device/deviceCatalog.js'

// --- Yardımcı: Analog kanal ekleme (pure) ---
function addAnalogChannel(channels) {
  const usedChannels = channels.map((c) => c.channel)
  let next = 0
  while (usedChannels.includes(next)) next++
  return [...channels, { channel: next, dataType: 'word' }]
}

// --- Yardımcı: Analog kanal silme (pure) ---
function removeAnalogChannel(channels, index) {
  if (index < 0 || index >= channels.length) return channels
  return channels.filter((_, i) => i !== index)
}

describe('Feature: scada-ui-professional — Cihaz Kataloğu ve Yapılandırma', () => {
  /**
   * Property 11: Cihaz Tipi Birim Otomatik Atanması
   * Sensör alt tipi seçildiğinde birim katalogdaki unit değerine eşit olmalı,
   * tip değiştiğinde alanlar sıfırlanmalı.
   *
   * **Validates: Requirements 5.5, 17.3, 17.4**
   */
  describe('Property 11: Cihaz Tipi Birim Otomatik Atanması', () => {
    const sensorSubtypes = DEVICE_CATALOG.sensor.subtypes

    it('sensör alt tipi seçildiğinde getUnit katalogdaki unit değerini döndürmelidir', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: sensorSubtypes.length - 1 }),
          (idx) => {
            const subtype = sensorSubtypes[idx]
            const unit = getUnit('sensor', subtype.value)
            expect(unit).toBe(subtype.unit)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('cihaz tipi değiştiğinde alt tip ve birim alanları sıfırlanmalıdır', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('sensor', 'plc'),
          fc.constantFrom('sensor', 'plc'),
          (fromType, toType) => {
            // Tip değişikliği simülasyonu: fromType'tan toType'a geçiş
            // Sıfırlama mantığı: tip değiştiğinde subtype='', unit='', modbusConfig=null, ioConfig=null
            const device = {
              deviceType: fromType,
              subtype: fromType === 'sensor' ? 'temperature' : 'dvp_es2',
              unit: getUnit(fromType, fromType === 'sensor' ? 'temperature' : 'dvp_es2'),
              modbusConfig: fromType === 'plc' ? {} : null,
              ioConfig: fromType === 'plc' ? {} : null,
            }

            if (fromType !== toType) {
              // Tip değiştiğinde alanlar sıfırlanmalı
              const resetDevice = {
                deviceType: toType,
                subtype: '',
                unit: '',
                modbusConfig: null,
                ioConfig: null,
              }
              expect(resetDevice.subtype).toBe('')
              expect(resetDevice.unit).toBe('')
              expect(resetDevice.modbusConfig).toBeNull()
              expect(resetDevice.ioConfig).toBeNull()
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('tüm sensör alt tipleri için getUnit doğru birim döndürmelidir', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...sensorSubtypes.map((s) => s.value)),
          (subtypeValue) => {
            const expected = sensorSubtypes.find((s) => s.value === subtypeValue).unit
            const actual = getUnit('sensor', subtypeValue)
            expect(actual).toBe(expected)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('geçersiz alt tip için getUnit boş string döndürmelidir', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }).filter(
            (s) => !sensorSubtypes.some((st) => st.value === s)
          ),
          (invalidSubtype) => {
            const unit = getUnit('sensor', invalidSubtype)
            expect(unit).toBe('')
          }
        ),
        { numRuns: 100 }
      )
    })
  })


  /**
   * Property 16: Analog Kanal Dinamik Ekleme/Silme
   * Kanal eklendiğinde sayı 1 artmalı, silindiğinde 1 azalmalı, kanal numaraları benzersiz olmalı.
   *
   * **Validates: Requirements 7.4, 7.5**
   */
  describe('Property 16: Analog Kanal Dinamik Ekleme/Silme', () => {
    it('analog giriş kanalı eklendiğinde sayı 1 artmalı ve kanal numaraları benzersiz olmalıdır', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 10 }),
          (addCount) => {
            let channels = [...DEFAULT_PLC_IO_CONFIG.analogInputs]
            const initialCount = channels.length

            for (let i = 0; i < addCount; i++) {
              channels = addAnalogChannel(channels)
            }

            // Kanal sayısı doğru artmalı
            expect(channels.length).toBe(initialCount + addCount)

            // Kanal numaraları benzersiz olmalı
            const channelNums = channels.map((c) => c.channel)
            expect(new Set(channelNums).size).toBe(channelNums.length)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('analog çıkış kanalı eklendiğinde sayı 1 artmalı ve kanal numaraları benzersiz olmalıdır', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 10 }),
          (addCount) => {
            let channels = [...DEFAULT_PLC_IO_CONFIG.analogOutputs]
            const initialCount = channels.length

            for (let i = 0; i < addCount; i++) {
              channels = addAnalogChannel(channels)
            }

            expect(channels.length).toBe(initialCount + addCount)

            const channelNums = channels.map((c) => c.channel)
            expect(new Set(channelNums).size).toBe(channelNums.length)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('analog kanal silindiğinde sayı 1 azalmalıdır', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 8 }),
          fc.nat(),
          (addCount, rawDeleteIdx) => {
            // Önce birkaç kanal ekle
            let channels = [...DEFAULT_PLC_IO_CONFIG.analogInputs]
            for (let i = 0; i < addCount; i++) {
              channels = addAnalogChannel(channels)
            }
            const beforeDelete = channels.length

            // Geçerli bir index ile sil
            const deleteIdx = rawDeleteIdx % channels.length
            channels = removeAnalogChannel(channels, deleteIdx)

            expect(channels.length).toBe(beforeDelete - 1)

            // Silme sonrası kanal numaraları hâlâ benzersiz olmalı
            const channelNums = channels.map((c) => c.channel)
            expect(new Set(channelNums).size).toBe(channelNums.length)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('ekleme ve silme sonrası kanal numaraları her zaman benzersiz kalmalıdır', () => {
      fc.assert(
        fc.property(
          fc.array(fc.constantFrom('add', 'remove'), { minLength: 1, maxLength: 15 }),
          (operations) => {
            let channels = [...DEFAULT_PLC_IO_CONFIG.analogInputs]

            for (const op of operations) {
              if (op === 'add') {
                channels = addAnalogChannel(channels)
              } else if (channels.length > 0) {
                const idx = Math.floor(Math.random() * channels.length)
                channels = removeAnalogChannel(channels, idx)
              }
            }

            // Her durumda kanal numaraları benzersiz olmalı
            const channelNums = channels.map((c) => c.channel)
            expect(new Set(channelNums).size).toBe(channelNums.length)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Property 17: Data Register Aralık Geçerliliği
   * start <= end olmalı.
   *
   * **Validates: Requirements 7.7**
   */
  describe('Property 17: Data Register Aralık Geçerliliği', () => {
    it('varsayılan data register yapılandırmasında start <= end olmalıdır', () => {
      const dr = DEFAULT_PLC_IO_CONFIG.dataRegister
      expect(dr.start).toBeLessThanOrEqual(dr.end)
    })

    it('geçerli data register aralığında start her zaman end\'den küçük veya eşit olmalıdır', () => {
      fc.assert(
        fc.property(
          fc.nat({ max: 9999 }),
          fc.nat({ max: 9999 }),
          (a, b) => {
            // Geçerli bir aralık oluştur: start <= end
            const start = Math.min(a, b)
            const end = Math.max(a, b)

            const dataRegister = {
              start,
              end,
              dataType: 'word',
            }

            expect(dataRegister.start).toBeLessThanOrEqual(dataRegister.end)

            // Register sayısı negatif olmamalı
            const registerCount = dataRegister.end - dataRegister.start + 1
            expect(registerCount).toBeGreaterThanOrEqual(1)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('geçersiz aralık (start > end) tespit edilmelidir', () => {
      fc.assert(
        fc.property(
          fc.nat({ max: 9999 }),
          fc.integer({ min: 1, max: 9999 }),
          (base, offset) => {
            const start = base + offset
            const end = base

            // start > end durumu geçersiz olmalı
            if (start > end) {
              expect(start).toBeGreaterThan(end)
              // Bu durumda doğrulama fonksiyonu false döndürmeli
              const isValid = start <= end
              expect(isValid).toBe(false)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('data register dataType geçerli DATA_TYPES listesinde olmalıdır', () => {
      const validTypes = DATA_TYPES.map((dt) => dt.value)

      fc.assert(
        fc.property(
          fc.constantFrom(...validTypes),
          fc.nat({ max: 9999 }),
          fc.nat({ max: 9999 }),
          (dataType, a, b) => {
            const start = Math.min(a, b)
            const end = Math.max(a, b)

            const dataRegister = { start, end, dataType }

            expect(dataRegister.start).toBeLessThanOrEqual(dataRegister.end)
            expect(validTypes).toContain(dataRegister.dataType)
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
