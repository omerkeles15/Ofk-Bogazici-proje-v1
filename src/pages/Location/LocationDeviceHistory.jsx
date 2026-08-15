import { LayoutDashboard } from 'lucide-react'
import DeviceHistoryPage from '../shared/DeviceHistoryPage'

const menu = [{ path: '/location/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> }]

export default function LocationDeviceHistory() {
  return <DeviceHistoryPage menuItems={menu} />
}
