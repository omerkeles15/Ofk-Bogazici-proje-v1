import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './app/ProtectedRoute'
import { useCompanyStore } from './features/company/companyStore'
import { useUserStore } from './features/users/userStore'

import LoginPage from './pages/Login/LoginPage'
import AdminDashboard from './pages/Admin/AdminDashboard'
import AdminCompanies from './pages/Admin/AdminCompanies'
import AdminCompanyDetail from './pages/Admin/AdminCompanyDetail'
import AdminUsers from './pages/Admin/AdminUsers'
import AdminDevices from './pages/Admin/AdminDevices'
import AdminDeviceHistory from './pages/Admin/AdminDeviceHistory'
import AdminESP32Page from './pages/Admin/AdminESP32Page'
import FinancePage from './pages/Admin/FinancePage'
import CompanyDashboard from './pages/Company/CompanyDashboard'
import CompanyDeviceHistory from './pages/Company/CompanyDeviceHistory'
import LocationDashboard from './pages/Location/LocationDashboard'
import LocationDeviceHistory from './pages/Location/LocationDeviceHistory'
import UserDashboard from './pages/User/UserDashboard'
import UserDeviceHistory from './pages/User/UserDeviceHistory'
import Unauthorized from './pages/Unauthorized'

export default function App() {
  const fetchCompanies = useCompanyStore((s) => s.fetchCompanies)
  const fetchUsers = useUserStore((s) => s.fetchUsers)

  // İlk yükleme + 10 saniyede bir güncelleme (çoklu cihaz/tarayıcı senkronizasyonu)
  useEffect(() => {
    fetchCompanies()
    fetchUsers()
    const interval = setInterval(() => {
      fetchCompanies()
      fetchUsers()
    }, 10000)
    return () => clearInterval(interval)
  }, [fetchCompanies, fetchUsers])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/unauthorized" element={<Unauthorized />} />

      {/* Admin Routes */}
      <Route path="/admin/dashboard" element={
        <ProtectedRoute allowedRoles={['admin']}><AdminDashboard /></ProtectedRoute>
      } />
      <Route path="/admin/companies" element={
        <ProtectedRoute allowedRoles={['admin']}><AdminCompanies /></ProtectedRoute>
      } />
      <Route path="/admin/companies/:id" element={
        <ProtectedRoute allowedRoles={['admin']}><AdminCompanyDetail /></ProtectedRoute>
      } />
      <Route path="/admin/users" element={
        <ProtectedRoute allowedRoles={['admin']}><AdminUsers /></ProtectedRoute>
      } />
      <Route path="/admin/devices" element={
        <ProtectedRoute allowedRoles={['admin']}><AdminDevices /></ProtectedRoute>
      } />
      <Route path="/admin/device/:deviceId" element={
        <ProtectedRoute allowedRoles={['admin']}><AdminDeviceHistory /></ProtectedRoute>
      } />
      <Route path="/admin/esp32" element={
        <ProtectedRoute allowedRoles={['admin']}><AdminESP32Page /></ProtectedRoute>
      } />
      <Route path="/admin/finance" element={
        <ProtectedRoute allowedRoles={['admin']}><FinancePage /></ProtectedRoute>
      } />

      {/* Company Manager */}
      <Route path="/company/dashboard" element={
        <ProtectedRoute allowedRoles={['company_manager']}><CompanyDashboard /></ProtectedRoute>
      } />
      <Route path="/company/device/:deviceId" element={
        <ProtectedRoute allowedRoles={['company_manager']}><CompanyDeviceHistory /></ProtectedRoute>
      } />

      {/* Location Manager */}
      <Route path="/location/dashboard" element={
        <ProtectedRoute allowedRoles={['location_manager']}><LocationDashboard /></ProtectedRoute>
      } />
      <Route path="/location/device/:deviceId" element={
        <ProtectedRoute allowedRoles={['location_manager']}><LocationDeviceHistory /></ProtectedRoute>
      } />

      {/* User */}
      <Route path="/user/dashboard" element={
        <ProtectedRoute allowedRoles={['user']}><UserDashboard /></ProtectedRoute>
      } />
      <Route path="/user/device/:deviceId" element={
        <ProtectedRoute allowedRoles={['user']}><UserDeviceHistory /></ProtectedRoute>
      } />

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
