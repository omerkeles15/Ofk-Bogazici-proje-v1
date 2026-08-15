import { describe, it, expect } from 'vitest'
import { parseDeviceData } from '../../features/device/parseDeviceData.js'

describe('parseDeviceData', () => {
  describe('Dijital I/O parse', () => {
    it('"1" → true (ON), "0" → false (OFF) dönüşümü yapar', () => {
      const jsonData = {
        data: {
          digitalInputs: { X0: '1', X1: '0', X2: '1' },
          digitalOutputs: { Y0: '0', Y1: '1' },
        },
      }
      const result = parseDeviceData(jsonData)
      expect(result.digitalInputs.X0).toBe(true)
      expect(result.digitalInputs.X1).toBe(false)
      expect(result.digitalInputs.X2).toBe(true)
      expect(result.digitalOutputs.Y0).toBe(false)
      expect(result.digitalOutputs.Y1).toBe(true)
    })
  })

  describe('Analog parse — dataType bazlı', () => {
    it('word dataType ile parseInt kullanır', () => {
      const jsonData = {
        data: {
          analogInputs: { AI0: { value: '1024', dataType: 'word' } },
        },
      }
      const result = parseDeviceData(jsonData)
      expect(result.analogInputs.AI0).toBe(1024)
    })

    it('dword dataType ile parseInt kullanır', () => {
      const jsonData = {
        data: {
          analogInputs: { AI0: { value: '65536', dataType: 'dword' } },
        },
      }
      const result = parseDeviceData(jsonData)
      expect(result.analogInputs.AI0).toBe(65536)
    })

    it('unsigned dataType ile parseInt kullanır', () => {
      const jsonData = {
        data: {
          analogOutputs: { AO0: { value: '512', dataType: 'unsigned' } },
        },
      }
      const result = parseDeviceData(jsonData)
      expect(result.analogOutputs.AO0).toBe(512)
    })

    it('udword dataType ile parseInt kullanır', () => {
      const jsonData = {
        data: {
          dataRegisters: { D0: { value: '100000', dataType: 'udword' } },
        },
      }
      const result = parseDeviceData(jsonData)
      expect(result.dataRegisters.D0).toBe(100000)
    })

    it('float dataType ile parseFloat kullanır', () => {
      const jsonData = {
        data: {
          analogOutputs: { AO0: { value: '3.14', dataType: 'float' } },
          dataRegisters: { D0: { value: '27.5', dataType: 'float' } },
        },
      }
      const result = parseDeviceData(jsonData)
      expect(result.analogOutputs.AO0).toBeCloseTo(3.14)
      expect(result.dataRegisters.D0).toBeCloseTo(27.5)
    })
  })

  describe('Boş/eksik veri durumları', () => {
    it('data alanı olmayan JSON için boş sonuç döner', () => {
      const result = parseDeviceData({})
      expect(result.digitalInputs).toEqual({})
      expect(result.digitalOutputs).toEqual({})
      expect(result.analogInputs).toEqual({})
      expect(result.analogOutputs).toEqual({})
      expect(result.dataRegisters).toEqual({})
    })

    it('null jsonData için boş sonuç döner', () => {
      const result = parseDeviceData(null)
      expect(result.digitalInputs).toEqual({})
    })

    it('kısmi data ile sadece mevcut alanları parse eder', () => {
      const jsonData = {
        data: {
          digitalInputs: { X0: '1' },
        },
      }
      const result = parseDeviceData(jsonData)
      expect(result.digitalInputs.X0).toBe(true)
      expect(result.analogInputs).toEqual({})
      expect(result.dataRegisters).toEqual({})
    })
  })
})
