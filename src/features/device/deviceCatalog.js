// Cihaz tipi kataloğu - sadece Sensör ve PLC

export const DEVICE_CATALOG = {
  sensor: {
    label: 'Sensör',
    subtypes: [
      { value: 'temperature', label: 'Sıcaklık Sensörü',  unit: '°C' },
      { value: 'pressure',    label: 'Basınç Sensörü',     unit: 'bar' },
      { value: 'humidity',    label: 'Nem Sensörü',        unit: '%' },
      { value: 'vibration',   label: 'Titreşim Sensörü',   unit: 'mm/s' },
      { value: 'flow',        label: 'Akış Sensörü',       unit: 'm³/h' },
      { value: 'level',       label: 'Seviye Sensörü',     unit: 'cm' },
      { value: 'voltage',     label: 'Voltaj Sensörü',     unit: 'V' },
      { value: 'current',     label: 'Akım Sensörü',       unit: 'A' },
      { value: 'power',       label: 'Güç Sensörü',        unit: 'kW' },
      { value: 'co2',         label: 'CO₂ Sensörü',        unit: 'ppm' },
      { value: 'smoke',       label: 'Duman Sensörü',      unit: '%obs' },
      { value: 'proximity',   label: 'Yakınlık Sensörü',   unit: 'mm' },
    ],
  },
  plc: {
    label: 'PLC',
    subtypes: [
      { value: 'dvp_es2', label: 'Delta DVP-ES2', unit: 'dijital I/O' },
      { value: 'dvp_ex2', label: 'Delta DVP-EX2', unit: 'analog I/O' },
      { value: 'dvp_ss2', label: 'Delta DVP-SS2', unit: 'dijital I/O' },
      { value: 'dvp_sa2', label: 'Delta DVP-SA2', unit: 'analog I/O' },
      { value: 'dvp_sx2', label: 'Delta DVP-SX2', unit: 'karma I/O' },
      { value: 'dvp_eh3', label: 'Delta DVP-EH3', unit: 'dijital I/O' },
      { value: 'dvp_eh2', label: 'Delta DVP-EH2', unit: 'dijital I/O' },
      { value: 'dvp_pm',  label: 'Delta DVP-PM',  unit: 'motion' },
    ],
  },
}

export const DEVICE_TYPE_OPTIONS = Object.entries(DEVICE_CATALOG).map(([value, meta]) => ({
  value,
  label: meta.label,
}))

export function getSubtypes(deviceType) {
  return DEVICE_CATALOG[deviceType]?.subtypes ?? []
}

export function getUnit(deviceType, subtype) {
  return DEVICE_CATALOG[deviceType]?.subtypes.find((s) => s.value === subtype)?.unit ?? ''
}

// Modbus varsayılan yapılandırması - tüm Delta DVP serileri için
export const DEFAULT_MODBUS_CONFIG = {
  slaveId: 1,
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  readInterval: 1000,
  timeout: 500,
  retryCount: 2,
}

export const MODBUS_OPTIONS = {
  baudRate: [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200],
  dataBits: [7, 8],
  stopBits: [1, 2],
  parity: [
    { value: 'none', label: 'None' },
    { value: 'even', label: 'Even' },
    { value: 'odd',  label: 'Odd' },
  ],
}

// PLC I/O ve Register yapılandırması için varsayılanlar — eski sabit aşağıda @deprecated
export const DATA_TYPES = [
  { value: 'word',         label: 'Word (INT16)' },
  { value: 'dword',        label: 'Double Word (INT32)' },
  { value: 'unsigned',     label: 'Unsigned Word (UINT16)' },
  { value: 'udword',       label: 'Unsigned DWord (UINT32)' },
  { value: 'float',        label: 'Float (Real)' },
]

/**
 * @deprecated Yeni cihazlar için DEFAULT_PLC_IO_CONFIG_V2 kullanın.
 * PlcIoConfigForm bileşeni bu sabiti artık kullanmamaktadır.
 */
export const DEFAULT_PLC_IO_CONFIG = {
  // Dijital Girişler (X)
  digitalInputs: {
    count: 8,
  },
  // Dijital Çıkışlar (Y)
  digitalOutputs: {
    count: 6,
  },
  // Analog Girişler
  analogInputs: [
    { channel: 0, dataType: 'word' },
    { channel: 1, dataType: 'word' },
  ],
  // Analog Çıkışlar
  analogOutputs: [
    { channel: 0, dataType: 'word' },
  ],
  // Data Register aralığı
  dataRegister: {
    start: 0,
    end: 100,
    dataType: 'word',
  },
}

// Delta DVP X adresleri
// İlk grup: X0-X7 (8 adet)
// Sonraki gruplar: X20-X27, X30-X37, X40-X47... (her biri 8 adet)
export function getDeltaXAddresses(count) {
  const addrs = []
  if (count <= 0) return addrs

  // İlk grup X0-X7
  for (let i = 0; i < 8 && addrs.length < count; i++) {
    addrs.push(`X${i}`)
  }
  // Sonraki gruplar: oktal gruplama kuralı — 8 ve 9 ile biten onluk gruplar atlanır
  // X20-X27, X30-X37, ..., X70-X77, X100-X107, X110-X117, ...
  let group = 2
  while (addrs.length < count) {
    // Oktal olmayan grupları atla (onlar basamağı 8 veya 9 olan gruplar)
    const groupDigit = group % 10
    if (groupDigit === 8 || groupDigit === 9) {
      group++
      continue
    }
    const base = group * 10
    for (let i = 0; i < 8 && addrs.length < count; i++) {
      addrs.push(`X${base + i}`)
    }
    group++
  }
  return addrs
}


// Delta DVP Y adresleri
// İlk grup: Y0-Y5 (6 adet, DVP-SS2 default)
// Sonraki gruplar: Y20-Y27, Y30-Y37, Y40-Y47... (her biri 8 adet)
export function getDeltaYAddresses(count) {
  const addrs = []
  if (count <= 0) return addrs

  // İlk 6 adet Y0-Y5
  for (let i = 0; i < 6 && addrs.length < count; i++) {
    addrs.push(`Y${i}`)
  }
  // Sonraki gruplar: oktal gruplama kuralı — 8 ve 9 ile biten onluk gruplar atlanır
  // Y20-Y27, Y30-Y37, ..., Y70-Y77, Y100-Y107, Y110-Y117, ...
  let group = 2
  while (addrs.length < count) {
    const groupDigit = group % 10
    if (groupDigit === 8 || groupDigit === 9) {
      group++
      continue
    }
    const base = group * 10
    for (let i = 0; i < 8 && addrs.length < count; i++) {
      addrs.push(`Y${base + i}`)
    }
    group++
  }
  return addrs
}

/**
 * Yeni PLC I/O yapılandırma varsayılanı.
 * PlcIoConfigForm bileşeniyle kullanılır.
 */
export const DEFAULT_PLC_IO_CONFIG_V2 = {
  coils: [],
  dataRegisters: [],
}

/**
 * Data Register veri tipi seçenekleri
 */
export const DATA_TYPE_OPTIONS = [
  { value: 'W',    label: 'W',    desc: 'Word (uint16)',        wordSize: 1, range: '0 – 65535' },
  { value: 'INT',  label: 'INT',  desc: 'Integer (int16)',      wordSize: 1, range: '-32768 – 32767' },
  { value: 'DW',   label: 'DW',   desc: 'Double Word (uint32)', wordSize: 2, range: '0 – 4294967295' },
  { value: 'DINT', label: 'DINT', desc: 'Double Int (int32)',   wordSize: 2, range: '-2147483648 – 2147483647' },
  { value: 'FLT',  label: 'FLT',  desc: 'Float (IEEE-754)',     wordSize: 2, range: '±3.4×10³⁸' },
]

/**
 * Modbus iletişim zamanlama varsayılanları
 */
export const DEFAULT_MODBUS_TIMING = {
  readInterval: 1000,  // ms — okuma periyodu
  timeout: 500,        // ms — Modbus timeout
  retryCount: 2,       // tekrar deneme sayısı
}
