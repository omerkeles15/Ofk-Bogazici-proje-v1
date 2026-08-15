import { LayoutDashboard } from 'lucide-react'
import DeviceHistoryPage from '../shared/DeviceHistoryPage'

const menu = [{ path: '/user/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> }]

export default function UserDeviceHistory() {
  return <DeviceHistoryPage menuItems={menu} />
}
