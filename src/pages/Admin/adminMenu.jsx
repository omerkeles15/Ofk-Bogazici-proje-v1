import { LayoutDashboard, Building2, Users, Cpu, Wifi, DollarSign } from 'lucide-react'

export const adminMenu = [
  { path: '/admin/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { path: '/admin/companies', label: 'Firmalar', icon: <Building2 size={18} /> },
  { path: '/admin/devices', label: 'Cihazlar', icon: <Cpu size={18} /> },
  { path: '/admin/users', label: 'Kullanıcılar', icon: <Users size={18} /> },
  { path: '/admin/esp32', label: 'Bağlı Cihazlar', icon: <Wifi size={18} /> },
  { path: '/admin/finance', label: 'Hesap Yönetimi', icon: <DollarSign size={18} /> },
]
