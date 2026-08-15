import { create } from 'zustand'
import axios from 'axios'

const API = '/api'

export const useCompanyStore = create((set, get) => ({
  companies: [],
  deviceHistory: {},
  ioHistory: {},
  loading: false,

  // ── Backend'den veri çek ───────────────────────────────────
  fetchCompanies: async () => {
    set({ loading: true })
    try {
      const res = await axios.get(`${API}/companies`)
      set({ companies: res.data, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  // ── COMPANY CRUD ───────────────────────────────────────────
  addCompany: async (company) => {
    const res = await axios.post(`${API}/companies`, company)
    set((s) => ({ companies: [...s.companies, res.data] }))
  },

  updateCompany: async (id, data) => {
    await axios.put(`${API}/companies/${id}`, data)
    await get().fetchCompanies()
  },

  deleteCompany: async (id) => {
    await axios.delete(`${API}/companies/${id}`)
    set((s) => ({ companies: s.companies.filter((c) => c.id !== id) }))
  },

  // ── LOCATION CRUD ──────────────────────────────────────────
  addLocation: async (companyId, location) => {
    await axios.post(`${API}/companies/${companyId}/locations`, location)
    await get().fetchCompanies()
  },

  updateLocation: async (companyId, locationId, data) => {
    await axios.put(`${API}/companies/${companyId}/locations/${locationId}`, data)
    await get().fetchCompanies()
  },

  deleteLocation: async (companyId, locationId) => {
    await axios.delete(`${API}/companies/${companyId}/locations/${locationId}`)
    await get().fetchCompanies()
  },

  // ── DEVICE CRUD ────────────────────────────────────────────
  addDevice: async (companyId, locationId, device) => {
    await axios.post(`${API}/companies/${companyId}/locations/${locationId}/devices`, device)
    await get().fetchCompanies()
  },

  updateDevice: async (companyId, locationId, deviceId, data) => {
    // Backend'e kaydet
    await axios.put(`${API}/companies/${companyId}/locations/${locationId}/devices/${deviceId}`, data)
    // plcIoConfig veya unitPrice değişikliği varsa tam yenile — tüm sayfalar senkronize olur
    if (data.plcIoConfig !== undefined || data.unitPrice !== undefined) {
      await get().fetchCompanies()
      return
    }
    // Hızlı lokal güncelleme — ioTags, tagName, status vb.
    set((s) => ({
      companies: s.companies.map((c) =>
        c.id === companyId
          ? {
              ...c,
              locations: c.locations.map((l) =>
                l.id === locationId
                  ? { ...l, devices: l.devices.map((d) =>
                      d.id === deviceId ? { ...d, ...data } : d
                    )}
                  : l
              ),
            }
          : c
      ),
    }))
  },

  deleteDevice: async (companyId, locationId, deviceId) => {
    await axios.delete(`${API}/companies/${companyId}/locations/${locationId}/devices/${deviceId}`)
    await get().fetchCompanies()
  },

  toggleDeviceStatus: async (companyId, locationId, deviceId) => {
    await axios.post(`${API}/companies/${companyId}/locations/${locationId}/devices/${deviceId}/toggle`)
    await get().fetchCompanies()
  },

  peekNextDeviceId: () => {
    const ids = get().companies
      .flatMap((c) => c.locations)
      .flatMap((l) => l.devices)
      .map((d) => {
        const match = d.id.match(/DEV-(\d+)/)
        return match ? parseInt(match[1], 10) : 0
      })
    const max = ids.length > 0 ? Math.max(...ids) : 0
    return `DEV-${String(max + 1).padStart(3, '0')}`
  },

  // ── I/O History (PLC — local state) ────────────────────────
  appendIOHistory: (deviceId, address, record) =>
    set((s) => {
      const key = `${deviceId}:${address}`
      return { ioHistory: { ...s.ioHistory, [key]: [...(s.ioHistory[key] ?? []), record] } }
    }),

  appendBulkIOHistory: (deviceId, dataMap, timestamp) =>
    set((s) => {
      const updated = { ...s.ioHistory }
      for (const [address, value] of Object.entries(dataMap)) {
        const key = `${deviceId}:${address}`
        updated[key] = [...(updated[key] ?? []), { id: `${key}-H-${Date.now()}`, value: String(value), timestamp }]
      }
      return { ioHistory: updated }
    }),

  clearIOHistory: (deviceId, address) =>
    set((s) => ({ ioHistory: { ...s.ioHistory, [`${deviceId}:${address}`]: [] } })),

  clearAllIOHistory: (deviceId) =>
    set((s) => {
      const updated = { ...s.ioHistory }
      for (const key of Object.keys(updated)) {
        if (key.startsWith(`${deviceId}:`)) updated[key] = []
      }
      return { ioHistory: updated }
    }),
}))
