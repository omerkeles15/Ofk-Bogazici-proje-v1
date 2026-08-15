import { describe, it, expect } from 'vitest'
import { generateDeviceJsonTemplate } from '../../features/device/generateJsonTemplate.js'

const company = { id: 1, displayName: 'Acme', fullName: 'Acme Corp' }
const location = { id: 10, name: 'İzmir Tesisi' }

describe('generateDeviceJsonTemplate', () => {
  describe('Sensör cihazları', () => {
    it('sensör için doğru JSON yapısı üretir', () => {
      const device = {
        id: 'DEV-001',
        deviceType: 'sensor',
        subtype: 'temperature',
        value: 72.4,
        unit: '°C',
        status: 'online',
      }

      const result = generateDeviceJsonTemplate(device, company, location)

      expect(result.deviceId).toBe('DEV-001')
      expect(result.companyId).toBe('1')
      expect(result.locationId).toBe('10')
      expect(result.type).toBe('sensor')
      expect(result.timestamp).toBeDefined()
      expect(result.data.value).toBe('72.4')
      expect(result.data.unit).toBe('°C')
      expect(result.data.status).toBe('online')
    })

    it('value olmayan sensör için varsayılan "0" kullanır', () => {
      const device = { id: 'DEV-002', deviceType: 'sensor', unit: 'bar' }
      const result = generateDeviceJsonTemplate(device, company, location)
      expect(result.data.value).toBe('0')
    })

    it('tüm değerler string formatında olmalı', () => {
      const device = {
        id: 'DEV-001',
        deviceType: 'sensor',
        value: 100,
        unit: 'V',
        status: 'offline',
      }
      const result = generateDeviceJsonTemplate(device, company, location)
      expect(typeof result.deviceId).toBe('string')
      expect(typeof result.companyId).toBe('string')
      expect(typeof result.locationId).toBe('string')
      expect(typeof result.data.value).toBe('string')
    })
  })

  describe('PLC cihazları', () => {
    const plcDevice = {
      id: 'DEV-005',
      deviceType: 'plc',
      subtype: 'dvp_ss2',
      modbusConfig: {
        slaveId: 1,
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
      },
      plcIoConfig: {
        digitalInputs: { count: 8 },
        digitalOutputs: { count: 6 },
        analogInputs: [
          { channel: 0, dataType: 'word' },
          { channel: 1, dataType: 'word' },
        ],
        analogOutputs: [{ channel: 0, dataType: 'word' }],
        dataRegister: { start: 0, end: 2, dataType: 'word' },
      },
    }

    it('PLC için doğru temel alanları üretir', () => {
      const result = generateDeviceJsonTemplate(plcDevice, company, location)
      expect(result.type).toBe('plc')
      expect(result.model).toBe('dvp_ss2')
      expect(result.modbus).toEqual(plcDevice.modbusConfig)
    })

    it('8 dijital giriş için X0-X7 adreslerini üretir', () => {
      const result = generateDeviceJsonTemplate(plcDevice, company, location)
      const diKeys = Object.keys(result.data.digitalInputs)
      expect(diKeys).toHaveLength(8)
      expect(diKeys).toEqual(['X0', 'X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7'])
      // Tüm değerler "0" string olmalı
      diKeys.forEach((k) => expect(result.data.digitalInputs[k]).toBe('0'))
    })

    it('6 dijital çıkış için Y0-Y5 adreslerini üretir', () => {
      const result = generateDeviceJsonTemplate(plcDevice, company, location)
      const doKeys = Object.keys(result.data.digitalOutputs)
      expect(doKeys).toHaveLength(6)
      expect(doKeys).toEqual(['Y0', 'Y1', 'Y2', 'Y3', 'Y4', 'Y5'])
    })

    it('analog girişleri doğru formatta üretir', () => {
      const result = generateDeviceJsonTemplate(plcDevice, company, location)
      expect(result.data.analogInputs).toEqual({
        AI0: { value: '0', dataType: 'word' },
        AI1: { value: '0', dataType: 'word' },
      })
    })

    it('analog çıkışları doğru formatta üretir', () => {
      const result = generateDeviceJsonTemplate(plcDevice, company, location)
      expect(result.data.analogOutputs).toEqual({
        AO0: { value: '0', dataType: 'word' },
      })
    })

    it('data register aralığını doğru üretir', () => {
      const result = generateDeviceJsonTemplate(plcDevice, company, location)
      expect(result.data.dataRegisters).toEqual({
        D0: { value: '0', dataType: 'word' },
        D1: { value: '0', dataType: 'word' },
        D2: { value: '0', dataType: 'word' },
      })
    })

    it('I/O yapılandırması değiştiğinde şablon güncellenir (16 giriş)', () => {
      const device16 = {
        ...plcDevice,
        plcIoConfig: {
          ...plcDevice.plcIoConfig,
          digitalInputs: { count: 16 },
        },
      }
      const result = generateDeviceJsonTemplate(device16, company, location)
      const diKeys = Object.keys(result.data.digitalInputs)
      expect(diKeys).toHaveLength(16)
      // İlk 8: X0-X7, sonraki 8: X20-X27
      expect(diKeys.slice(0, 8)).toEqual(['X0', 'X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7'])
      expect(diKeys.slice(8, 16)).toEqual(['X20', 'X21', 'X22', 'X23', 'X24', 'X25', 'X26', 'X27'])
    })

    it('plcIoConfig olmayan PLC için boş I/O üretir', () => {
      const bareDevice = { id: 'DEV-010', deviceType: 'plc', subtype: 'dvp_es2' }
      const result = generateDeviceJsonTemplate(bareDevice, company, location)
      expect(Object.keys(result.data.digitalInputs)).toHaveLength(0)
      expect(Object.keys(result.data.digitalOutputs)).toHaveLength(0)
      expect(Object.keys(result.data.analogInputs)).toHaveLength(0)
      expect(Object.keys(result.data.analogOutputs)).toHaveLength(0)
      // dataRegister varsayılan: start=0, end=0 → D0 tek kayıt
      expect(Object.keys(result.data.dataRegisters)).toHaveLength(1)
    })
  })
})
