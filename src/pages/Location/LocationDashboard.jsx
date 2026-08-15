import { Cpu, Wifi, WifiOff, LayoutDashboard } from 'lucide-react'
import AppLayout from '../../components/Layout/AppLayout'
import StatCard from '../../components/StatCard'
import SensorCard from '../../components/SensorCard'
import { useCompanyStore } from '../../features/company/companyStore'
import { useAuth } from '../../hooks/useAuth'

const menu = [
  { path: '/location/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
]

export default function LocationDashboard() {
  const { user } = useAuth()
  const companies = useCompanyStore((s) => s.companies)
  const company = companies.find((c) => c.id === user?.companyId)
  const location = company?.locations.find((l) => l.id === user?.locationId)

  if (!location) return (
    <AppLayout menuItems={menu}>
      <p className="text-gray-500">Lokasyon bilgisi bulunamadı.</p>
    </AppLayout>
  )

  const onlineCount = location.devices.filter((d) => d.status === 'online').length

  return (
    <AppLayout menuItems={menu}>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold">{location.name}</h1>
          <p className="text-gray-500 text-sm">{company.displayName}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="Toplam Cihaz" value={location.devices.length} icon={<Cpu size={22} />} color="blue" />
          <StatCard label="Online" value={onlineCount} icon={<Wifi size={22} />} color="green" />
          <StatCard label="Offline" value={location.devices.length - onlineCount} icon={<WifiOff size={22} />} color="red" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {location.devices.map((d) => <SensorCard key={d.id} device={d} />)}
        </div>
      </div>
    </AppLayout>
  )
}
