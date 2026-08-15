/**
 * PLC I/O Yapılandırma yardımcı fonksiyonları
 */

export const DEFAULT_COIL_ROW = {
  plcTag: '',
  coilAddress: 0,
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
  registerAddress: 0,
  length: 1,
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
    return { coils: [], analogChannels: [], dataRegisters: [] }
  }
  // Yeni format
  if ('coils' in raw || 'dataRegisters' in raw) {
    return {
      coils:         Array.isArray(raw.coils)         ? raw.coils         : [],
      dataRegisters: Array.isArray(raw.dataRegisters) ? raw.dataRegisters : [],
    }
  }
  // Eski format → boş
  return { coils: [], dataRegisters: [] }
}
