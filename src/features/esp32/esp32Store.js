import { create } from 'zustand'
import axios from 'axios'

const API = '/api'

export const useEsp32Store = create((set) => ({
  devices: [],
  loading: false,
  error: null,

  fetchDevices: async () => {
    set({ loading: true, error: null })
    try {
      const res = await axios.get(`${API}/esp32/devices`)
      set({ devices: res.data, loading: false })
    } catch (err) {
      set({
        loading: false,
        error: err.response?.data?.detail || 'Cihazlar yüklenemedi',
      })
    }
  },

  linkDevice: async (esp32Id, deviceId) => {
    try {
      await axios.post(`${API}/esp32/link`, { esp32_id: esp32Id, device_id: deviceId })
      // Başarıda listeyi yenile
      const res = await axios.get(`${API}/esp32/devices`)
      set({ devices: res.data, error: null })
    } catch (err) {
      set({ error: err.response?.data?.detail || 'Bağlantı kurulamadı' })
      throw err  // çağıran tarafın yakalaması için
    }
  },

  deleteEsp32: async (id) => {
    await axios.delete(`${API}/esp32/${id}`)
    const res = await axios.get(`${API}/esp32/devices`)
    set({ devices: res.data })
  },

  updateEsp32Tag: async (id, tag) => {
    await axios.patch(`${API}/esp32/${id}/tag`, { esp32_tag: tag })
    const res = await axios.get(`${API}/esp32/devices`)
    set({ devices: res.data })
  },
}))
