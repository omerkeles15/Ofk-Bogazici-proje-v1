/**
 * DataType'a göre string değeri uygun numerik tipe parse eder.
 * word/dword/unsigned/udword → parseInt, float → parseFloat
 *
 * @param {string} value - String formatındaki ham değer
 * @param {string} dataType - Veri tipi (word, dword, unsigned, udword, float)
 * @returns {number} Parse edilmiş numerik değer
 */
function parseByType(value, dataType) {
  if (dataType === 'float') return parseFloat(value)
  return parseInt(value, 10)
}

/**
 * Dışarıdan gelen JSON verisini frontend gösterimi için parse eder.
 * - Dijital I/O: "1" → true (ON), "0" → false (OFF)
 * - Analog/Register: dataType'a göre parseInt veya parseFloat
 *
 * @param {object} jsonData - Gelen JSON verisi (data alanı içeren)
 * @returns {object} Parse edilmiş veri nesnesi
 */
export function parseDeviceData(jsonData) {
  const result = {
    digitalInputs: {},
    digitalOutputs: {},
    analogInputs: {},
    analogOutputs: {},
    dataRegisters: {},
  }

  const data = jsonData?.data ?? {}

  // Dijital I/O: "1" → true (ON), "0" → false (OFF)
  for (const [addr, val] of Object.entries(data.digitalInputs ?? {})) {
    result.digitalInputs[addr] = val === '1'
  }
  for (const [addr, val] of Object.entries(data.digitalOutputs ?? {})) {
    result.digitalOutputs[addr] = val === '1'
  }

  // Analog girişler: dataType'a göre parse
  for (const [addr, obj] of Object.entries(data.analogInputs ?? {})) {
    result.analogInputs[addr] = parseByType(obj.value, obj.dataType)
  }

  // Analog çıkışlar: dataType'a göre parse
  for (const [addr, obj] of Object.entries(data.analogOutputs ?? {})) {
    result.analogOutputs[addr] = parseByType(obj.value, obj.dataType)
  }

  // Data registers: dataType'a göre parse
  for (const [addr, obj] of Object.entries(data.dataRegisters ?? {})) {
    result.dataRegisters[addr] = parseByType(obj.value, obj.dataType)
  }

  return result
}
