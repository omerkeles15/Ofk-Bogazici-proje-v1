import { LayoutDashboard } from 'lucide-react'
import DeviceHistoryPage from '../shared/DeviceHistoryPage'

const menu = [{ path: '/company/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> }]

export default function CompanyDeviceHistory() {
  return <DeviceHistoryPage menuItems={menu} />
}
