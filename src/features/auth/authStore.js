import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import axios from 'axios'

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      login: async (username, password) => {
        // Eski cache'leri temizle
        localStorage.removeItem('scada-user-storage')
        localStorage.removeItem('scada-company-storage')

        const res = await axios.post('/api/auth/login', { username, password })
        const { user, token, redirect } = res.data
        set({ user, token, isAuthenticated: true })
        return redirect
      },

      logout: () => {
        localStorage.removeItem('scada-user-storage')
        localStorage.removeItem('scada-company-storage')
        set({ user: null, token: null, isAuthenticated: false })
      },
    }),
    { name: 'auth-storage' }
  )
)
