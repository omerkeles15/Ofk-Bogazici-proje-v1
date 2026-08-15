import { useState } from 'react'
import { Trash2, AlertTriangle } from 'lucide-react'
import { useEsp32Store } from '../../features/esp32/esp32Store'
import { useCompanyStore } from '../../features/company/companyStore'

const STATUS_CONFIG = {
  connected: { icon: '🟢', label: 'Bağlı',      className: 'text-green-600 font-medium' },
  waiting:   { icon: '🟡', label: 'Bekleniyor', className: 'text-yellow-600 font-medium' },
  offline:   { icon: '🔴', label: 'Çevrimdışı', className: 'text-red-500 font-medium' },
}

function formatLastSeen(val) {
  if (!val) return '—'
  try { return new Date(val).toLocaleString('tr-TR') } catch { return '—' }
}

function TagCell({ device }) {
  const { updateEsp32Tag } = useEsp32Store()
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(device.esp32_tag)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (val.trim() === device.esp32_tag) { setEditing(false); return }
    setSaving(true)
    try {
      await updateEsp32Tag(device.id, val.trim())
      setEditing(false)
    } catch { setVal(device.esp32_tag) } finally { setSaving(false) }
  }

  if (editing) return (
    <input
      autoFocus
      className="px-2 py-1 border border-blue-300 rounded text-sm w-36 focus:outline-none focus:ring-1 focus:ring-blue-400"
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={save}
      onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setVal(device.esp32_tag); setEditing(false) } }}
      disabled={saving}
    />
  )

  return (
    <button onClick={() => setEditing(true)} className="text-left text-gray-800 font-medium hover:text-blue-600 hover:underline underline-offset-2 text-sm">
      {device.esp32_tag}
      {device.conflict && <AlertTriangle size={12} className="inline ml-1 text-amber-500" title="Aynı MAC farklı tag ile bağlandı" />}
    </button>
  )
}

export default function ESP32DeviceTable({ devices = [], isAdmin = false }) {
  const { deleteEsp32 } = useEsp32Store()
  const companies = useCompanyStore(s => s.companies)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  // firma/lokasyon adı bul
  const getNames = (device) => {
    if (!device.company_id && !device.location_id) return { companyName: '—', locationName: '—' }
    for (const c of companies) {
      if (c.id === device.company_id) {
        const loc = c.locations?.find(l => l.id === device.location_id)
        return { companyName: c.displayName, locationName: loc?.name ?? '—' }
      }
    }
    return { companyName: '—', locationName: '—' }
  }

  const headers = ['ID', 'ESP32 Tag', 'Cihaz Türü', 'Model', 'IP Adresi', 'Firma', 'Lokasyon', 'Bağlı Cihaz', 'Durum', 'Son Görülme', '']

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {headers.map(h => <th key={h} className="text-left px-4 py-3 font-medium text-gray-500 whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {devices.length === 0 ? (
              <tr><td colSpan={headers.length} className="text-center py-10 text-gray-400">Henüz kayıtlı cihaz yok</td></tr>
            ) : devices.map(device => {
              const { companyName, locationName } = getNames(device)
              const statusCfg = STATUS_CONFIG[device.status] ?? STATUS_CONFIG.offline
              return (
                <tr key={device.id} className={`border-t border-gray-50 hover:bg-gray-50 transition-colors ${device.conflict ? 'bg-amber-50/40' : ''}`}>
                  <td className="px-4 py-3 text-gray-500 tabular-nums text-xs">{device.id}</td>
                  <td className="px-4 py-3"><TagCell device={device} /></td>
                  <td className="px-4 py-3 text-gray-700 text-xs">{device.device_type}</td>
                  <td className="px-4 py-3 text-gray-700 text-xs">{device.model}</td>
                  <td className="px-4 py-3 text-gray-500 tabular-nums text-xs">{device.ip_address ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{companyName}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{locationName}</td>
                  <td className="px-4 py-3">
                    {device.device_id
                      ? <span className="font-mono text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{device.device_id}</span>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3"><span className={statusCfg.className}>{statusCfg.icon} {statusCfg.label}</span></td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap tabular-nums text-xs">{formatLastSeen(device.last_seen)}</td>
                  <td className="px-4 py-3">
                    {isAdmin && (
                      <button onClick={() => setDeleteConfirm(device)} className="p-1 text-gray-300 hover:text-red-500 transition-colors" title="Sil">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="font-semibold text-gray-800 mb-2">ESP32 Sil</h3>
            <p className="text-sm text-gray-600 mb-4">
              <strong>{deleteConfirm.esp32_tag}</strong> cihazını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2 rounded-xl border border-gray-200 text-sm">İptal</button>
              <button onClick={async () => { await deleteEsp32(deleteConfirm.id); setDeleteConfirm(null) }}
                className="flex-1 py-2 rounded-xl bg-red-600 text-white text-sm font-medium">Sil</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
