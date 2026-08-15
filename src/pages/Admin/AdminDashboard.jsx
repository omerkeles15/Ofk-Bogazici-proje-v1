import { Building2, MapPin, Users, Cpu } from 'lucide-react'
import AppLayout from '../../components/Layout/AppLayout'
import StatCard from '../../components/StatCard'
import { useCompanyStore } from '../../features/company/companyStore'
import { useUserStore } from '../../features/users/userStore'
import { adminMenu } from './adminMenu'

export default function AdminDashboard() {
  const companies = useCompanyStore((s) => s.companies)
  const users = useUserStore((s) => s.users)

  const totalLocations = companies.reduce((acc, c) => acc + c.locations.length, 0)
  const totalDevices = companies
    .flatMap((c) => c.locations)
    .flatMap((l) => l.devices).length
  const onlineDevices = companies
    .flatMap((c) => c.locations)
    .flatMap((l) => l.devices)
    .filter((d) => d.status === 'online').length

  return (
    <AppLayout menuItems={adminMenu}>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold">Admin Dashboard</h1>
          <p className="text-gray-500 text-sm">Sistem geneli özet</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Toplam Firma" value={companies.length} icon={<Building2 size={22} />} color="blue" />
          <StatCard label="Toplam Lokasyon" value={totalLocations} icon={<MapPin size={22} />} color="purple" />
          <StatCard label="Toplam Kullanıcı" value={users.length} icon={<Users size={22} />} color="green" />
          <StatCard label={`Cihaz (${onlineDevices} online)`} value={totalDevices} icon={<Cpu size={22} />} color="orange" />
        </div>

        {/* Firma özet tablosu */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold mb-4">Firma Özeti</h2>
          <div className="space-y-3">
            {companies.map((c) => {
              const devCount = c.locations.flatMap((l) => l.devices).length
              const onlineCount = c.locations.flatMap((l) => l.devices).filter((d) => d.status === 'online').length
              return (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50">
                  <div>
                    <p className="font-medium text-sm">{c.displayName}</p>
                    <p className="text-xs text-gray-400">{c.locations.length} lokasyon</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{devCount} cihaz</p>
                    <p className="text-xs text-green-600">{onlineCount} online</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
