import { getDeltaXAddresses, getDeltaYAddresses } from './deviceCatalog'

/**
 * Cihaz yapılandırmasına göre dinamik JSON şablonu üretir.
 * Sensör: standart format
 * PLC: kompakt format (DI/DO desimal, AI/AO/DR virgülle ayrılmış dizi)
 */
export function generateDeviceJsonTemplate(device, company, location) {
  const base = {
    deviceId: String(device.id),
    companyId: String(company.id),
    locationId: String(location.id),
    timestamp: new Date().toISOString(),
    type: device.deviceType,
  }

  if (device.deviceType === 'sensor') {
    return {
      ...base,
      subtype: device.subtype ?? '',
      data: {
        value: String(device.value ?? 0),
        unit: device.unit ?? '',
        status: device.status ?? 'offline',
      },
    }
  }

  // PLC — Kompakt Format
  const io = device.plcIoConfig ?? {}
  const data = {}

  // DI: Dijital Girişler — desimal string
  // Örnek: 16 giriş, hepsi 0 → "0", X0+X1 aktif → "3", hepsi aktif → "65535"
  const diCount = io.digitalInputs?.count ?? 0
  if (diCount > 0) {
    data.DI = "0"
  }

  // DO: Dijital Çıkışlar — desimal string
  const doCount = io.digitalOutputs?.count ?? 0
  if (doCount > 0) {
    data.DO = "0"
  }

  // AI: Analog Girişler — virgülle ayrılmış
  const aiChannels = io.analogInputs ?? []
  if (aiChannels.length > 0) {
    data.AI = aiChannels.map(() => '0').join(',')
  }

  // AO: Analog Çıkışlar — virgülle ayrılmış
  const aoChannels = io.analogOutputs ?? []
  if (aoChannels.length > 0) {
    data.AO = aoChannels.map(() => '0').join(',')
  }

  // DR: Data Register — virgülle ayrılmış
  const dr = io.dataRegister ?? { start: 0, end: 0 }
  const drCount = Math.max(0, (dr.end ?? 0) - (dr.start ?? 0) + 1)
  if (drCount > 0) {
    data.DR = Array(drCount).fill('0').join(',')
  }

  return { ...base, data }
}

/**
 * Kompakt format açıklama metni üretir — kullanıcıya gösterilir.
 */
export function generateCompactFormatDescription(device) {
  if (device.deviceType !== 'plc') return null

  const io = device.plcIoConfig ?? {}
  const lines = []

  const diCount = io.digitalInputs?.count ?? 0
  if (diCount > 0) {
    lines.push(`DI: ${diCount} dijital giriş → desimal string (örn: "244" = binary 11110100)`)
  }

  const doCount = io.digitalOutputs?.count ?? 0
  if (doCount > 0) {
    lines.push(`DO: ${doCount} dijital çıkış → desimal string (örn: "21" = binary 010101)`)
  }

  const aiCount = (io.analogInputs ?? []).length
  if (aiCount > 0) {
    lines.push(`AI: ${aiCount} analog giriş → virgülle ayrılmış (örn: "1024,2048")`)
  }

  const aoCount = (io.analogOutputs ?? []).length
  if (aoCount > 0) {
    lines.push(`AO: ${aoCount} analog çıkış → virgülle ayrılmış (örn: "512")`)
  }

  const dr = io.dataRegister ?? {}
  const drCount = Math.max(0, (dr.end ?? 0) - (dr.start ?? 0) + 1)
  if (drCount > 0) {
    lines.push(`DR: D${dr.start}-D${dr.end} (${drCount} register) → virgülle ayrılmış (örn: "100,200,0,...")`)
  }

  return lines
}
