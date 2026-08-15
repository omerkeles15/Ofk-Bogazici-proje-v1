import { Wifi, WifiOff, Clock, BarChart2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const HISTORY_ROUTES = {
  admin: (id) => `/admin/device/${id}`,
  company_manager: (id) => `/company/device/${id}`,
  location_manager: (id) => `/location/device/${id}`,
  user: (id) => `/user/device/${id}`,
}

export default function SensorCard({ device }) {
  const isOnline = device.status === 'online'
  const time = new Date(device.timestamp).toLocaleTimeString('tr-TR')
  const navigate = useNavigate()
  const { role } = useAuth()

  const handleView = () => {
    const route = HISTORY_ROUTES[role]?.(device.id)
    if (route) navigate(route)
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-semibold text-sm text-gray-700">{device.tagName}</h3>
        <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full
          ${isOnline ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
          {isOnline ? <Wifi size={11} /> : <WifiOff size={11} />}
          {isOnline ? 'Online' : 'Offline'}
        </span>
      </div>

      <div className="mb-3">
        <span className="text-3xl font-bold text-gray-900">{device.value}</span>
        <span className="text-sm text-gray-400 ml-1">{device.unit}</span>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-400">
        <span className="font-mono bg-gray-50 px-2 py-0.5 rounded">{device.id}</span>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            <Clock size={11} />
            {time}
          </span>
          <button
            onClick={handleView}
            className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
            title="Geçmiş Verileri Görüntüle"
          >
            <BarChart2 size={12} />
            <span>İzle</span>
          </button>
        </div>
      </div>
    </div>
  )
}
