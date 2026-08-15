import { create } from 'zustand'
import axios from 'axios'

const API = '/api'

export const useUserStore = create((set, get) => ({
  users: [],

  fetchUsers: async () => {
    try {
      const res = await axios.get(`${API}/users`)
      set({ users: res.data })
    } catch { /* ignore */ }
  },

  addUser: async (user) => {
    const res = await axios.post(`${API}/users`, user)
    set((s) => ({ users: [...s.users, res.data] }))
    return res.data
  },

  updateUser: async (id, data) => {
    const res = await axios.put(`${API}/users/${id}`, data)
    set((s) => ({ users: s.users.map((u) => u.id === id ? res.data : u) }))
  },

  deleteUser: async (id) => {
    await axios.delete(`${API}/users/${id}`)
    set((s) => ({ users: s.users.filter((u) => u.id !== id) }))
  },
}))
