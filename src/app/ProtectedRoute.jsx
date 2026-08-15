import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

// allowedRoles boşsa sadece giriş kontrolü yapar
export default function ProtectedRoute({ children, allowedRoles = [] }) {
  const { isAuthenticated, role } = useAuth()

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    return <Navigate to="/unauthorized" replace />
  }
  return children
}
