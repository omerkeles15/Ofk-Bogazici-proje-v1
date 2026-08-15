import { describe, it, expect } from 'vitest'
import {
  DEVICE_CATALOG,
  getSubtypes,
  getUnit,
  DEFAULT_MODBUS_CONFIG,
  DEFAULT_PLC_IO_CONFIG,
  getDeltaXAddresses,
  getDeltaYAddresses,
} from '../../features/device/deviceCatalog.js'

// ============================================================
// Task 18.1 — Cihaz kataloğu birim testleri
// Validates: Requirements 17.1, 17.2, 6.3, 7.8
// ============================================================

describe('Cihaz Kataloğu — Sensör Alt Tipleri', () => {
  const subtypes = DEVICE_CATALOG.sensor.subtypes

  it('12 sensör alt tipi tanımlı olmalı', () => {
    expect(subtypes).toHaveLength(12)
  })

  it.each([
    ['temperature', 'Sıcaklık Sensörü', '°C'],
    ['pressure', 'Basınç Sensörü', 'bar'],
    ['humidity', 'Nem Sensörü', '%'],
    ['vibration', 'Titreşim Sensörü', 'mm/s'],
    ['flow', 'Akış Sensörü', 'm³/h'],
    ['level', 'Seviye Sensörü', 'cm'],
    ['voltage', 'Voltaj Sensörü', 'V'],
    ['current', 'Akım Sensörü', 'A'],
    ['power', 'Güç Sensörü', 'kW'],
    ['co2', 'CO₂ Sensörü', 'ppm'],
    ['smoke', 'Duman Sensörü', '%obs'],
    ['proximity', 'Yakınlık Sensörü', 'mm'],
  ])('%s → label: %s, unit: %s', (value, label, unit) => {
    const found = subtypes.find((s) => s.value === value)
    expect(found).toBeDefined()
    expect(found.label).toBe(label)
    expect(found.unit).toBe(unit)
  })
})

describe('Cihaz Kataloğu — PLC Delta DVP Modelleri', () => {
  const subtypes = DEVICE_CATALOG.plc.subtypes

  it('8 PLC Delta DVP model tanımlı olmalı', () => {
    expect(subtypes).toHaveLength(8)
  })

  it.each([
    ['dvp_es2', 'Delta DVP-ES2'],
    ['dvp_ex2', 'Delta DVP-EX2'],
    ['dvp_ss2', 'Delta DVP-SS2'],
    ['dvp_sa2', 'Delta DVP-SA2'],
    ['dvp_sx2', 'Delta DVP-SX2'],
    ['dvp_eh3', 'Delta DVP-EH3'],
    ['dvp_eh2', 'Delta DVP-EH2'],
    ['dvp_pm', 'Delta DVP-PM'],
  ])('%s → label: %s', (value, label) => {
    const found = subtypes.find((s) => s.value === value)
    expect(found).toBeDefined()
    expect(found.label).toBe(label)
  })
})

describe('getUnit() fonksiyonu', () => {
  it('sensör alt tipi için doğru birim döndürmeli', () => {
    expect(getUnit('sensor', 'temperature')).toBe('°C')
    expect(getUnit('sensor', 'pressure')).toBe('bar')
    expect(getUnit('sensor', 'co2')).toBe('ppm')
  })

  it('PLC alt tipi için doğru birim döndürmeli', () => {
    expect(getUnit('plc', 'dvp_es2')).toBe('dijital I/O')
    expect(getUnit('plc', 'dvp_pm')).toBe('motion')
  })

  it('geçersiz tip/alt tip için boş string döndürmeli', () => {
    expect(getUnit('sensor', 'nonexistent')).toBe('')
    expect(getUnit('invalid', 'temperature')).toBe('')
  })
})

describe('getSubtypes() fonksiyonu', () => {
  it('sensor tipi için 12 alt tip döndürmeli', () => {
    const result = getSubtypes('sensor')
    expect(result).toHaveLength(12)
    expect(result[0]).toHaveProperty('value')
    expect(result[0]).toHaveProperty('label')
    expect(result[0]).toHaveProperty('unit')
  })

  it('plc tipi için 8 alt tip döndürmeli', () => {
    const result = getSubtypes('plc')
    expect(result).toHaveLength(8)
  })

  it('geçersiz tip için boş dizi döndürmeli', () => {
    expect(getSubtypes('invalid')).toEqual([])
  })
})

describe('Modbus varsayılan değerleri', () => {
  it('varsayılan Modbus yapılandırması doğru olmalı', () => {
    expect(DEFAULT_MODBUS_CONFIG).toEqual({
      slaveId: 1,
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
    })
  })
})

describe('I/O varsayılan değerleri', () => {
  it('varsayılan dijital giriş sayısı 8 olmalı', () => {
    expect(DEFAULT_PLC_IO_CONFIG.digitalInputs.count).toBe(8)
  })

  it('varsayılan dijital çıkış sayısı 6 olmalı', () => {
    expect(DEFAULT_PLC_IO_CONFIG.digitalOutputs.count).toBe(6)
  })

  it('varsayılan analog giriş sayısı 2 olmalı', () => {
    expect(DEFAULT_PLC_IO_CONFIG.analogInputs).toHaveLength(2)
  })

  it('varsayılan analog çıkış sayısı 1 olmalı', () => {
    expect(DEFAULT_PLC_IO_CONFIG.analogOutputs).toHaveLength(1)
  })

  it('varsayılan data register aralığı D0-D100 olmalı', () => {
    expect(DEFAULT_PLC_IO_CONFIG.dataRegister.start).toBe(0)
    expect(DEFAULT_PLC_IO_CONFIG.dataRegister.end).toBe(100)
  })
})


// ============================================================
// Task 18.2 — Delta DVP adres üretimi edge case testleri
// Validates: Requirements 7.9, 7.10
// ============================================================

describe('getDeltaXAddresses — edge case testleri', () => {
  it('getDeltaXAddresses(0) → boş dizi', () => {
    expect(getDeltaXAddresses(0)).toEqual([])
  })

  it('getDeltaXAddresses(8) → X0-X7', () => {
    expect(getDeltaXAddresses(8)).toEqual([
      'X0', 'X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7',
    ])
  })

  it('getDeltaXAddresses(16) → X0-X7, X20-X27', () => {
    expect(getDeltaXAddresses(16)).toEqual([
      'X0', 'X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7',
      'X20', 'X21', 'X22', 'X23', 'X24', 'X25', 'X26', 'X27',
    ])
  })
})

describe('getDeltaYAddresses — edge case testleri', () => {
  it('getDeltaYAddresses(0) → boş dizi', () => {
    expect(getDeltaYAddresses(0)).toEqual([])
  })

  it('getDeltaYAddresses(6) → Y0-Y5', () => {
    expect(getDeltaYAddresses(6)).toEqual([
      'Y0', 'Y1', 'Y2', 'Y3', 'Y4', 'Y5',
    ])
  })

  it('getDeltaYAddresses(14) → Y0-Y5, Y20-Y27', () => {
    expect(getDeltaYAddresses(14)).toEqual([
      'Y0', 'Y1', 'Y2', 'Y3', 'Y4', 'Y5',
      'Y20', 'Y21', 'Y22', 'Y23', 'Y24', 'Y25', 'Y26', 'Y27',
    ])
  })
})
