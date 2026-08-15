import axios from 'axios'

const API = '/api'

/**
 * Cihaz verilerini sayfalı ve filtreli çeker.
 * @param {string} deviceId
 * @param {object} opts - { limit, offset, from, to }
 * @returns {{ latest, records, total, limit, offset }}
 */
export async function fetchDeviceData(deviceId, opts = {}) {
  const params = {}
  if (opts.limit) params.limit = opts.limit
  if (opts.offset != null) params.offset = opts.offset
  if (opts.from) params.from = opts.from
  if (opts.to) params.to = opts.to
  const res = await axios.get(`${API}/device-data/${deviceId}`, { params })
  return res.data
}

/**
 * Cihaz istatistiklerini çeker.
 */
export async function fetchDeviceStats(deviceId) {
  const res = await axios.get(`${API}/device-data/${deviceId}/stats`)
  return res.data
}

/**
 * Cihaz geçmişini siler (opsiyonel tarih aralığı).
 */
export async function clearDeviceHistory(deviceId, opts = {}) {
  const params = {}
  if (opts.from) params.from = opts.from
  if (opts.to) params.to = opts.to
  const res = await axios.delete(`${API}/device-data/${deviceId}/history`, { params })
  return res.data
}
