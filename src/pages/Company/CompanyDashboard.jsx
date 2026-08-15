import { MapPin, Cpu, Users, Wifi } from 'lucide-react'
import { LayoutDashboard } from 'lucide-react'
import AppLayout from '../../components/Layout/AppLayout'
import StatCard from '../../components/StatCard'
import SensorCard from '../../components/SensorCard'
import { useCompanyStore } from '../../features/company/companyStore'
import { useAuth } from '../../hooks/useAuth'

const menu = [
  { path: '/company/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
]

export default function CompanyDashboard() {
  const { user } = useAuth()
  const companies = useCompanyStore((s) => s.companies)
  const company = companies.find((c) => c.id === user?.companyId)

  if (!company) return (
    <AppLayout menuItems={menu}>
      <p className="text-gray-500">Firma bilgisi bulunamadı.</p>
    </AppLayout>
  )

  const allDevices = company.locations.flatMap((l) => l.devices)
  const onlineCount = allDevices.filter((d) => d.status === 'online').length

  return (
    <AppLayout menuItems={menu}>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold">{company.displayName}</h1>
          <p className="text-gray-500 text-sm">{company.fullName}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Lokasyon" value={company.locations.length} icon={<MapPin size={22} />} color="purple" />
          <StatCard label="Toplam Cihaz" value={allDevices.length} icon={<Cpu size={22} />} color="blue" />
          <StatCard label="Online" value={onlineCount} icon={<Wifi size={22} />} color="green" />
          <StatCard label="Offline" value={allDevices.length - onlineCount} icon={<Wifi size={22} />} color="red" />
        </div>

        {company.locations.map((loc) => (
          <div key={loc.id}>
            <h2 className="font-semibold mb-3 flex items-center gap-2">
              <MapPin size={16} className="text-gray-400" /> {loc.name}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {loc.devices.map((d) => <SensorCard key={d.id} device={d} />)}
            </div>
          </div>
        ))}
      </div>
    </AppLayout>
  )
}
