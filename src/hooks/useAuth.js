import { useAuthStore } from '../features/auth/authStore'

export const useAuth = () => {
  const { user, isAuthenticated, login, logout } = useAuthStore()
  return { user, isAuthenticated, login, logout, role: user?.role }
}
