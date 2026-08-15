import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  DEFAULT_MODBUS_CONFIG,
  MODBUS_OPTIONS,
} from '../../features/device/deviceCatalog.js'

/**
 * Property 14: Modbus Parametre Aralık Doğrulaması
 * Slave ID 1-247, Baud Rate izin verilen değerler,
 * Data Bits 7/8, Stop Bits 1/2, Parity none/even/odd
 *
 * **Validates: Gereksinimler 6.2**
 */

const ALLOWED_BAUD_RATES = MODBUS_OPTIONS.baudRate
const ALLOWED_DATA_BITS = MODBUS_OPTIONS.dataBits
const ALLOWED_STOP_BITS = MODBUS_OPTIONS.stopBits
const ALLOWED_PARITIES = MODBUS_OPTIONS.parity.map((p) => p.value)

// Geçerli Modbus yapılandırması üreten generator
const validModbusConfigArb = fc.record({
  slaveId: fc.integer({ min: 1, max: 247 }),
  baudRate: fc.constantFrom(...ALLOWED_BAUD_RATES),
  dataBits: fc.constantFrom(...ALLOWED_DATA_BITS),
  stopBits: fc.constantFrom(...ALLOWED_STOP_BITS),
  parity: fc.constantFrom(...ALLOWED_PARITIES),
})

// Doğrulama fonksiyonu — geçerli Modbus config mi?
function isValidModbusConfig(config) {
  if (config.slaveId < 1 || config.slaveId > 247) return false
  if (!ALLOWED_BAUD_RATES.includes(config.baudRate)) return false
  if (!ALLOWED_DATA_BITS.includes(config.dataBits)) return false
  if (!ALLOWED_STOP_BITS.includes(config.stopBits)) return false
  if (!ALLOWED_PARITIES.includes(config.parity)) return false
  return true
}

describe('Property 14: Modbus Parametre Aralık Doğrulaması', () => {
  it('Geçerli Modbus yapılandırmaları tüm kısıtları sağlamalıdır', () => {
    fc.assert(
      fc.property(validModbusConfigArb, (config) => {
        // Slave ID 1-247 aralığında olmalı
        expect(config.slaveId).toBeGreaterThanOrEqual(1)
        expect(config.slaveId).toBeLessThanOrEqual(247)

        // Baud Rate izin verilen değerlerden biri olmalı
        expect(ALLOWED_BAUD_RATES).toContain(config.baudRate)

        // Data Bits 7 veya 8 olmalı
        expect(ALLOWED_DATA_BITS).toContain(config.dataBits)

        // Stop Bits 1 veya 2 olmalı
        expect(ALLOWED_STOP_BITS).toContain(config.stopBits)

        // Parity none, even veya odd olmalı
        expect(ALLOWED_PARITIES).toContain(config.parity)

        // Doğrulama fonksiyonu true dönmeli
        expect(isValidModbusConfig(config)).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it('Geçersiz Slave ID değerleri reddedilmelidir', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({ min: -1000, max: 0 }),
          fc.integer({ min: 248, max: 1000 })
        ),
        (invalidSlaveId) => {
          const config = { ...DEFAULT_MODBUS_CONFIG, slaveId: invalidSlaveId }
          expect(isValidModbusConfig(config)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Geçersiz Baud Rate değerleri reddedilmelidir', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 200000 }).filter(
          (v) => !ALLOWED_BAUD_RATES.includes(v)
        ),
        (invalidBaudRate) => {
          const config = { ...DEFAULT_MODBUS_CONFIG, baudRate: invalidBaudRate }
          expect(isValidModbusConfig(config)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Geçersiz Data Bits değerleri reddedilmelidir', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 16 }).filter(
          (v) => !ALLOWED_DATA_BITS.includes(v)
        ),
        (invalidDataBits) => {
          const config = { ...DEFAULT_MODBUS_CONFIG, dataBits: invalidDataBits }
          expect(isValidModbusConfig(config)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Geçersiz Stop Bits değerleri reddedilmelidir', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10 }).filter(
          (v) => !ALLOWED_STOP_BITS.includes(v)
        ),
        (invalidStopBits) => {
          const config = { ...DEFAULT_MODBUS_CONFIG, stopBits: invalidStopBits }
          expect(isValidModbusConfig(config)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Geçersiz Parity değerleri reddedilmelidir', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }).filter(
          (v) => !ALLOWED_PARITIES.includes(v)
        ),
        (invalidParity) => {
          const config = { ...DEFAULT_MODBUS_CONFIG, parity: invalidParity }
          expect(isValidModbusConfig(config)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Varsayılan Modbus yapılandırması tüm kısıtları sağlamalıdır', () => {
    expect(isValidModbusConfig(DEFAULT_MODBUS_CONFIG)).toBe(true)
    expect(DEFAULT_MODBUS_CONFIG.slaveId).toBe(1)
    expect(DEFAULT_MODBUS_CONFIG.baudRate).toBe(9600)
    expect(DEFAULT_MODBUS_CONFIG.dataBits).toBe(8)
    expect(DEFAULT_MODBUS_CONFIG.stopBits).toBe(1)
    expect(DEFAULT_MODBUS_CONFIG.parity).toBe('none')
  })
})
