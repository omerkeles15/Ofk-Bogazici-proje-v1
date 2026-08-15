import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, BarChart2, Pencil } from 'lucide-react'
import AppLayout from '../../components/Layout/AppLayout'
import SearchInput from '../../components/SearchInput'
import { useSearch } from '../../hooks/useSearch'
import { adminMenu } from './adminMenu'
import axios from 'axios'
import { useCompanyStore } from '../../features/company/companyStore'
import PlcIoConfigForm from '../../components/PlcIoConfigForm'
import { DEFAULT_PLC_IO_CONFIG_V2 } from '../../features/device/deviceCatalog'
import { useEsp32Store } from '../../features/esp32/esp32Store'

export default function AdminDevices() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [devices, setDevices] = useState([])
  const activeRef = useRef(true)

  const [editTarget, setEditTarget] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [editError, setEditError] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const updateDevice = useCompanyStore(s => s.updateDevice)
  const { devices: esp32Devices, fetchDevices: fetchEsp32Devices } = useEsp32Store()

  // 2 saniyede bir /api/devices'dan güncel veri çek (cache'siz, son değer dahil)
  useEffect(() => {
    activeRef.current = true

    const fetchDevices = async () => {
      try {
        const res = await axios.get('/api/devices')
        if (activeRef.current) setDevices(res.data)
      } catch { /* ignore */ }
    }

    fetchDevices()
    const interval = setInterval(fetchDevices, 2000)

    return () => {
      activeRef.current = false
      clearInterval(interval)
    }
  }, [])

  const filtered = useSearch(devices, ['id', 'tagName', 'companyName', 'locationName'], search)
  const onlineCount = devices.filter((d) => d.status === 'online').length

  return (
    <AppLayout menuItems={adminMenu}>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Cihaz Listesi</h1>
            <p className="text-gray-500 text-sm">
              {devices.length} cihaz · {onlineCount} aktif · {devices.length - onlineCount} pasif
            </p>
          </div>
        </div>

        <SearchInput value={search} onChange={setSearch} placeholder="ID, tag name, firma veya lokasyon ara..." />

        <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-500 whitespace-nowrap">Device ID</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 whitespace-nowrap">Tag Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 whitespace-nowrap">Firma</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 whitespace-nowrap">Lokasyon</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 whitespace-nowrap">ESP32</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 whitespace-nowrap">Son Değer</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 whitespace-nowrap">Durum</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">Cihaz bulunamadı</td></tr>
              ) : filtered.map((d) => (
                <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded font-semibold">{d.id}</span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800">{d.tagName}</td>
                  <td className="px-4 py-3 text-gray-500">{d.companyName}</td>
                  <td className="px-4 py-3 text-gray-500">{d.locationName}</td>
                  <td className="px-4 py-3">
                    {d.esp32Tag
                      ? <span className="text-xs text-indigo-600 font-medium">{d.esp32Tag}</span>
                      : <span className="text-gray-300">—</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    {d.status === 'online' && (d.lastValue != null) ? (
                      <>
                        <span className="font-semibold text-gray-800">{d.lastValue}</span>
                        <span className="text-gray-400 text-xs ml-1">{d.lastUnit || d.unit}</span>
                      </>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full
                      ${d.status === 'online' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${d.status === 'online' ? 'bg-green-500' : 'bg-red-400'}`} />
                      {d.status === 'online' ? 'Aktif' : 'Pasif'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => {
                        fetchEsp32Devices()
                        setEditForm({
                          tagName: d.tagName,
                          deviceType: d.deviceType ?? '',
                          subtype: d.subtype ?? '',
                          unit: d.unit ?? '',
                          modbusConfig: d.modbusConfig ?? null,
                          plcIoConfig: d.plcIoConfig ?? null,
                          unitPrice: d.unitPrice ?? 0,
                          selectedEsp32Id: null,
                        })
                        setEditError('')
                        setEditTarget(d)
                      }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-600 text-xs font-medium">
                        <Pencil size={13} /> Düzenle
                      </button>
                      <button onClick={() => navigate(`/admin/device/${d.id}`)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 text-xs font-medium transition-colors">
                        <BarChart2 size={13} /> İzle
                      </button>
                      <button onClick={() => navigate(`/admin/companies/${d.companyId}`)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-medium transition-colors">
                        <Eye size={13} /> Firma
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">Cihaz Düzenle — {editTarget.tagName}</h2>
              <button onClick={() => { setEditTarget(null); setEditError('') }} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form className="p-5 space-y-4" onSubmit={async (e) => {
              e.preventDefault()
              setEditSaving(true)
              setEditError('')
              try {
                await updateDevice(editTarget.companyId, editTarget.locationId, editTarget.id, editForm)
                setEditTarget(null)
              } catch (err) {
                setEditError(err.message || 'Kaydetme başarısız')
              } finally {
                setEditSaving(false)
              }
            }}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tag Name</label>
                <input className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={editForm.tagName || ''} onChange={e => setEditForm({...editForm, tagName: e.target.value})} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Birim Fiyat (₺/ay)</label>
                <input type="number" min="0" step="0.01" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={editForm.unitPrice || 0} onChange={e => setEditForm({...editForm, unitPrice: parseFloat(e.target.value) || 0})} />
              </div>
              {editForm.deviceType === 'plc' && editForm.subtype && (
                <PlcIoConfigForm
                  value={editForm.plcIoConfig ?? DEFAULT_PLC_IO_CONFIG_V2}
                  onChange={v => setEditForm({...editForm, plcIoConfig: v})}
                />
              )}
              {editError && <p className="text-red-500 text-sm">{editError}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditTarget(null)} className="flex-1 py-2 rounded-xl border border-gray-200 text-sm">İptal</button>
                <button type="submit" disabled={editSaving} className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium disabled:opacity-50">
                  {editSaving ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
