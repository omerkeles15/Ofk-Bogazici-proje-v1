/**
 * PLC I/O Yapılandırma yardımcı fonksiyonları
 */

export const DEFAULT_COIL_ROW = {
  plcTag: '',
  coilAddress: 2048,
  tagName: '',
  description: '',
}

export const DEFAULT_ANALOG_ROW = {
  plcTag: '',
  registerAddress: 0,
  length: 1,
  tagName: '',
  description: '',
}

export const DEFAULT_REGISTER_ROW = {
  plcTag: '',
  registerAddress: 4096,
  dataType: 'W',
  tagName: '',
  description: '',
}

/**
 * Diziyi hedef boyuta pad veya truncate eder.
 * Mevcut satırları korur; yeni satırlar defaultRow kopyasıyla doldurulur.
 */
export function resizeArray(arr, newCount, defaultRow) {
  const count = Math.max(0, Math.floor(newCount))
  if (count >= arr.length) {
    const padding = Array.from(
      { length: count - arr.length },
      () => ({ ...defaultRow })
    )
    return [...arr, ...padding]
  }
  return arr.slice(0, count)
}

/**
 * Ham plc_io_config değerini yeni formata normalize eder.
 * - null/undefined → boş yapı
 * - Eski format (digitalInputs vb.) → boş yapı
 * - Yeni format (coils/analogChannels/dataRegisters) → olduğu gibi
 */
export function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object') {
    return { coils: [], dataRegisters: [] }
  }
  // Yeni format
  if ('coils' in raw || 'dataRegisters' in raw) {
    return {
      coils:         Array.isArray(raw.coils)         ? raw.coils         : [],
      dataRegisters: migrateLegacyRegisters(Array.isArray(raw.dataRegisters) ? raw.dataRegisters : []),
    }
  }
  // Eski format → boş
  return { coils: [], dataRegisters: [] }
}

/**
 * Veri tipinin word boyutunu döner.
 * W, INT → 1 word; DW, DINT, FLT → 2 word
 */
export function getWordSize(dataType) {
  return ['DW', 'DINT', 'FLT'].includes(dataType) ? 2 : 1
}

/**
 * Register dizisi ve başlangıç adresinden tüm satırların
 * registerAddress ve plcTag değerlerini otomatik hesaplar.
 * @param {Array} registers - [{dataType, tagName, description, ...}]
 * @param {number} startAddress - İlk satırın register adresi (default: 4096)
 * @returns {Array} - Hesaplanmış registerAddress ve plcTag ile zenginleştirilmiş dizi
 */
export function computeAutoAddresses(registers, startAddress = 4096) {
  let currentAddr = startAddress
  return registers.map((reg) => {
    const ws = getWordSize(reg.dataType || 'W')
    const result = {
      ...reg,
      registerAddress: currentAddr,
      plcTag: `D${currentAddr - 4096}`,
    }
    currentAddr += ws
    return result
  })
}

/**
 * Register dizisinin toplam word sayısını hesaplar.
 */


/**
 * Coil dizisi ve başlangıç adresinden tüm satırların
 * coilAddress ve plcTag değerlerini otomatik hesaplar.
 * Delta DVP: 2048=M0, 2049=M1, ... (ardışık, her coil 1 bit)
 * @param {Array} coils - [{tagName, description, ...}]
 * @param {number} startAddress - İlk coil'in Modbus adresi (default: 2048)
 * @returns {Array} - Hesaplanmış coilAddress ve plcTag ile zenginleştirilmiş dizi
 */
export function computeAutoCoilAddresses(coils, startAddress = 2048) {
  return coils.map((coil, idx) => ({
    ...coil,
    coilAddress: startAddress + idx,
    plcTag: `M${(startAddress + idx) - 2048}`,
  }))
}
export function computeTotalWords(registers) {
  return registers.reduce((sum, reg) => sum + getWordSize(reg.dataType || 'W'), 0)
}

/**
 * Sayısal değeri min/max aralığına sıkıştırır.
 */
export function clampValue(value, min, max) {
  if (value < min) return min
  if (value > max) return max
  return value
}

/**
 * Eski format (length alanı) kayıtlarını yeni formata (dataType) dönüştürür.
 * length=1 → "W", length=2 → "DW"
 * Zaten dataType alanı varsa dokunmaz.
 */
export function migrateLegacyRegisters(registers) {
  if (!Array.isArray(registers)) return []
  return registers.map((reg) => {
    if (reg.length !== undefined && reg.dataType === undefined) {
      const dataType = reg.length >= 2 ? 'DW' : 'W'
      const { length, ...rest } = reg
      return { ...rest, dataType }
    }
    return reg
  })
}
