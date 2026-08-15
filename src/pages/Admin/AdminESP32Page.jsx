import { useEffect, useState } from 'react'
import { HelpCircle } from 'lucide-react'
import AppLayout from '../../components/Layout/AppLayout'
import { adminMenu } from './adminMenu'
import { useEsp32Store } from '../../features/esp32/esp32Store'
import ESP32DeviceTable from './ESP32DeviceTable'
import ConnectionGuideModal from './ConnectionGuideModal'

export default function AdminESP32Page() {
  const { devices, loading, error, fetchDevices } = useEsp32Store()
  const [guideOpen, setGuideOpen] = useState(false)

  useEffect(() => {
    fetchDevices()
    const interval = setInterval(fetchDevices, 10000)
    return () => clearInterval(interval)
  }, [fetchDevices])

  return (
    <AppLayout menuItems={adminMenu}>
      <div className="space-y-6">
        {/* Başlık */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Bağlı Cihazlar</h1>
            <p className="text-gray-500 text-sm">ESP32 cihaz bağlantı durumu</p>
          </div>
          <button
            onClick={() => setGuideOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm"
          >
            <HelpCircle size={16} />
            Bağlantı Rehberi
          </button>
        </div>

        {/* Yükleniyor */}
        {loading && devices.length === 0 && (
          <div className="flex items-center justify-center h-40 text-gray-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
          </div>
        )}

        {/* Hata */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between">
            <p className="text-red-600 text-sm">{error}</p>
            <button
              onClick={fetchDevices}
              className="text-sm text-red-600 font-medium hover:underline ml-4"
            >
              Yeniden Dene
            </button>
          </div>
        )}

        {/* Tablo */}
        {!loading || devices.length > 0 ? <ESP32DeviceTable devices={devices} isAdmin={true} /> : null}

        {/* Modal */}
        <ConnectionGuideModal isOpen={guideOpen} onClose={() => setGuideOpen(false)} />
      </div>
    </AppLayout>
  )
}
