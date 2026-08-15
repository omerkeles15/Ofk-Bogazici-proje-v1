import { LayoutDashboard } from 'lucide-react'
import AppLayout from '../../components/Layout/AppLayout'
import SensorCard from '../../components/SensorCard'
import { useCompanyStore } from '../../features/company/companyStore'
import { useAuth } from '../../hooks/useAuth'

const menu = [
  { path: '/user/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
]

export default function UserDashboard() {
  const { user } = useAuth()
  const companies = useCompanyStore((s) => s.companies)
  const company = companies.find((c) => c.id === user?.companyId)
  const location = company?.locations.find((l) => l.id === user?.locationId)

  return (
    <AppLayout menuItems={menu}>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold">Sensörlerim</h1>
          <p className="text-gray-500 text-sm">
            {location ? `${location.name} — ${company.displayName}` : 'Lokasyon atanmamış'}
          </p>
        </div>

        {!location || location.devices.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p>Görüntülenecek sensör bulunamadı.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {location.devices.map((d) => <SensorCard key={d.id} device={d} />)}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
