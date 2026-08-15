import { useState, memo, useMemo, useCallback, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Trash2, Filter, AlertTriangle, BarChart2, Cpu, HelpCircle, RefreshCw, TrendingUp, Download, FileText } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts'
import AppLayout from '../../components/Layout/AppLayout'
import Modal from '../../components/Modal'
import DeviceJsonInfoModal from '../../components/DeviceJsonInfoModal'
import IOPointHistoryPanel from '../../components/IOPointHistoryPanel'
import AlarmPanel from '../../components/AlarmPanel'
import { useCompanyStore } from '../../features/company/companyStore'
import { useAuth } from '../../hooks/useAuth'
import { normalizeConfig } from '../../features/device/plcIoUtils'
import PlcIoConfigForm from '../../components/PlcIoConfigForm'
import axios from 'axios'
import { fetchDeviceData, clearDeviceHistory as apiClearHistory } from '../../features/device/deviceApi'

const PAGE_SIZE_OPTIONS = [100, 200, 300]
const POLL_INTERVAL = 5000
const ADMIN_PASSWORD = 'admin123'

function DateTimeInput({ label, value, onChange }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-500">{label}</label>
      <input type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)}
        className="px-3 py-1.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
  )
}

function SensorView({ device, deviceId, isAdmin }) {
  const [records, setRecords] = useState([])
  const [total, setTotal] = useState(0)
  const [filtered, setFiltered] = useState(0)
  const [latest, setLatest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pageSize, setPageSize] = useState(100)
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteMode, setDeleteMode] = useState('all')
  const [password, setPassword] = useState('')
  const [pwError, setPwError] = useState('')
  const [wsConnected, setWsConnected] = useState(false)
  const wsRef = useRef(null)
  const retryRef = useRef(null)
  const filterRef = useRef({ from: '', to: '' })
  const pageSizeRef = useRef(100)

  // Ref'leri güncel tut
  useEffect(() => { filterRef.current = { from: filterFrom, to: filterTo } }, [filterFrom, filterTo])
  useEffect(() => { pageSizeRef.current = pageSize }, [pageSize])

  // HTTP ile veri çek (ilk yükleme + filtre değişikliği)
  const loadData = useCallback(async () => {
    try {
      const opts = { limit: pageSize }
      if (filterFrom) opts.from = filterFrom
      if (filterTo) opts.to = filterTo
      const res = await fetchDeviceData(deviceId, opts)
      setRecords(res.records ?? [])
      setTotal(res.total ?? 0)
      setFiltered(res.filtered ?? res.total ?? 0)
      setLatest(res.latest ?? null)
      setLoading(false)
    } catch {
      setLoading(false)
    }
  }, [deviceId, pageSize, filterFrom, filterTo])

  const loadDataRef = useRef(loadData)
  useEffect(() => { loadDataRef.current = loadData }, [loadData])
  const wsConnectedRef = useRef(false)

  // İlk yükleme + filtre değişikliğinde yeniden çek
  useEffect(() => { loadData() }, [loadData])

  // WebSocket bağlantısı — canlı veri anında gelir
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/ws/device/${deviceId}`
    let active = true

    function connect() {
      if (!active) return
      try {
        const ws = new WebSocket(url)
        wsRef.current = ws

        ws.onopen = () => {
          wsConnectedRef.current = true
          setWsConnected(true)
        }

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data)
            if (msg.type === 'new_data' && msg.record) {
              const r = msg.record
              const ts = r.timestamp || r.receivedAt || ''
              const f = filterRef.current

              // Toplam kayıt her zaman artar
              setTotal((prev) => prev + 1)
              setLatest(r)

              // Filtre kontrolü — filtre dışındaysa tabloya/grafiğe ekleme
              if (f.from && ts < f.from) return
              if (f.to && ts > f.to) return

              setFiltered((prev) => prev + 1)

              // Deduplicate: aynı timestamp + deviceId varsa ekleme
              setRecords((prev) => {
                const exists = prev.some((p) => p.timestamp === r.timestamp && p.deviceId === r.deviceId)
                if (exists) return prev
                return [r, ...prev].slice(0, pageSizeRef.current)
              })
            }
          } catch { /* ignore */ }
        }

        ws.onclose = () => {
          wsConnectedRef.current = false
          setWsConnected(false)
          if (active) retryRef.current = setTimeout(connect, 3000)
        }

        ws.onerror = () => ws.close()
      } catch {
        wsConnectedRef.current = false
        setWsConnected(false)
      }
    }

    connect()

    // Polling fallback — sadece WebSocket bağlı DEĞİLSE çalışır
    const pollInterval = setInterval(() => {
      if (!wsConnectedRef.current && active) loadDataRef.current()
    }, 2000)

    return () => {
      active = false
      clearInterval(pollInterval)
      if (retryRef.current) clearTimeout(retryRef.current)
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
      }
    }
  }, [deviceId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (e) => {
    e.preventDefault()
    setPwError('')
    if (password !== ADMIN_PASSWORD) { setPwError('Şifre hatalı'); return }
    const opts = {}
    if (deleteMode === 'range') {
      if (!filterFrom && !filterTo) { setPwError('Tarih aralığı seçilmemiş'); return }
      if (filterFrom) opts.from = filterFrom
      if (filterTo) opts.to = filterTo
    }
    await apiClearHistory(deviceId, opts)
    setPassword('')
    setShowDeleteModal(false)
    loadData()
  }

  const latestValue = latest?.data?.value ?? '-'
  const latestUnit = latest?.data?.unit ?? device.unit ?? ''
  const latestStatus = latest?.data?.status ?? 'offline'

  if (loading) return <p className="text-gray-400 text-sm py-8 text-center">Veriler yükleniyor...</p>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {[
          { label: 'Son Değer', value: `${latestValue} ${latestUnit}` },
          { label: 'Durum', value: latestStatus === 'online' ? '🟢 Online' : '🔴 Offline' },
          { label: 'Toplam Kayıt', value: total },
          { label: 'Filtreli', value: filtered },
          { label: 'Gösterilen', value: records.length },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-400 mb-1">{label}</p>
            <p className="text-xl font-bold text-gray-800">{value}</p>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-xl">
        <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-blue-500'} animate-pulse`} />
        <span className="text-xs text-blue-600 font-medium">
          {wsConnected ? 'Canlı bağlantı aktif — veri anında yansır' : 'Otomatik güncelleme aktif — 2 saniyede bir'}
        </span>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Filter size={15} /><span className="font-medium">Filtrele</span>
          </div>
          <DateTimeInput label="Başlangıç" value={filterFrom} onChange={setFilterFrom} />
          <DateTimeInput label="Bitiş" value={filterTo} onChange={setFilterTo} />
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Göster</label>
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}
              className="px-3 py-1.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>İlk {n} kayıt</option>)}
            </select>
          </div>
          <button onClick={() => { setFilterFrom(''); setFilterTo('') }}
            className="px-3 py-1.5 border border-gray-200 rounded-xl text-sm hover:bg-gray-50 mt-auto">Temizle</button>
          <button onClick={loadData}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 mt-auto" title="Yenile">
            <RefreshCw size={16} />
          </button>
          {isAdmin && (
            <div className="ml-auto flex gap-2 mt-auto">
              {(filterFrom || filterTo) && (
                <button onClick={() => { setDeleteMode('range'); setPassword(''); setPwError(''); setShowDeleteModal(true) }}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-orange-200 text-orange-600 rounded-xl text-sm hover:bg-orange-50">
                  <Trash2 size={13} /> Seçili Aralığı Sil
                </button>
              )}
              <button onClick={() => { setDeleteMode('all'); setPassword(''); setPwError(''); setShowDeleteModal(true) }}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-600 rounded-xl text-sm hover:bg-red-50">
                <Trash2 size={13} /> Tüm Geçmişi Sil
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sensör Grafiği */}
      {records.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={16} className="text-blue-500" />
            <p className="text-sm font-semibold text-gray-700">Canlı Veri Grafiği</p>
            <span className="text-xs text-gray-400 ml-auto">{device.unit}</span>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={[...records].reverse().map((r) => ({
              time: new Date(r.timestamp || r.receivedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              value: parseFloat(r.data?.value ?? 0),
              fullTime: new Date(r.timestamp || r.receivedAt).toLocaleString('tr-TR'),
            }))}>
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#9ca3af' }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} width={50} />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '12px' }}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullTime || ''}
                formatter={(value) => [`${value} ${device.unit}`, 'Değer']}
              />
              <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} fill="url(#colorValue)" dot={false} activeDot={{ r: 4, fill: '#3b82f6' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Alarm Paneli */}
      <AlarmPanel
        deviceId={deviceId}
        address="value"
        label={device.tagName}
        isAdmin={isAdmin}
        unit={device.unit}
        chartData={records.length > 0 ? [...records].reverse().map((r) => ({
          time: new Date(r.timestamp || r.receivedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          value: parseFloat(r.data?.value ?? 0),
        })) : []}
      />

      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-500">#</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Değer</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Birim</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Durum</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Tarih</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Saat</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400">Henüz veri gelmedi</td></tr>
            ) : records.map((r, i) => {
              const dt = new Date(r.timestamp || r.receivedAt)
              return (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{i + 1}</td>
                  <td className="px-4 py-2.5 font-semibold text-gray-800">{r.data?.value ?? '-'}</td>
                  <td className="px-4 py-2.5 text-gray-500">{r.data?.unit ?? ''}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.data?.status === 'online' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {r.data?.status === 'online' ? 'Online' : 'Offline'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{isNaN(dt) ? '-' : dt.toLocaleDateString('tr-TR')}</td>
                  <td className="px-4 py-2.5 text-gray-600 font-mono text-xs">{isNaN(dt) ? '-' : dt.toLocaleTimeString('tr-TR')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {showDeleteModal && (
        <Modal title={deleteMode === 'all' ? 'Tüm Geçmişi Sil' : 'Seçili Aralığı Sil'} onClose={() => setShowDeleteModal(false)}>
          <form onSubmit={handleDelete} className="space-y-4">
            <div className="flex items-start gap-3 p-3 bg-red-50 rounded-xl">
              <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">
                {deleteMode === 'all'
                  ? `"${device.tagName}" cihazına ait tüm geçmiş veriler silinecek.`
                  : 'Seçili aralıktaki veriler silinecek.'} Bu işlem geri alınamaz.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Admin şifrenizi girin</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                placeholder="••••••••" autoFocus />
            </div>
            {pwError && <p className="text-red-500 text-sm">{pwError}</p>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm">İptal</button>
              <button type="submit"
                className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium">Sil</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Satır içi düzenlenebilir hücre — DOSYA DÜZEYİNDE (focus kaybını önler)
// ─────────────────────────────────────────────────────────────
const EditCell = memo(function EditCell({ value, onChange, type = 'text', placeholder = '', className = '' }) {
  const [local, setLocal] = useState(String(value ?? ''))
  const [focused, setFocused] = useState(false)
  useEffect(() => { if (!focused) setLocal(String(value ?? '')) }, [value, focused])
  return (
    <input
      type={type}
      value={local}
      placeholder={placeholder}
      className={`px-2 py-1 border border-transparent rounded focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-300 bg-transparent hover:bg-white hover:border-gray-200 text-xs transition-colors ${className}`}
      style={{ minWidth: type === 'number' ? '64px' : '80px' }}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); onChange(local) }}
      onChange={e => setLocal(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
    />
  )
})

// Coil satırı — DOSYA DÜZEYİNDE + memo (re-render'da unmount olmaz)
const CoilRow = memo(function CoilRow({ coil, idx, isAdmin, ioValsRef, updateRow, onSelectPoint }) {
  const addr = coil.plcTag || `coil_${coil.coilAddress}`
  const currentVal = ioValsRef.current?.[addr]
  const isOn = currentVal === '1' || currentVal === 'true' || currentVal === true
  const hasVal = currentVal != null
  return (
    <tr className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
      <td className="px-2 py-1.5">
        {isAdmin
          ? <EditCell value={coil.plcTag} placeholder="X0" className="font-mono text-blue-700 font-bold"
              onChange={v => updateRow('coils', idx, 'plcTag', v)} />
          : <span className="font-mono text-xs font-bold text-blue-700 px-2">{coil.plcTag || '—'}</span>}
      </td>
      <td className="px-2 py-1.5">
        {isAdmin
          ? <EditCell value={coil.coilAddress} type="number" placeholder="1025"
              onChange={v => updateRow('coils', idx, 'coilAddress', parseInt(v) || 0)} />
          : <span className="text-xs text-gray-500 tabular-nums px-2">{coil.coilAddress}</span>}
      </td>
      <td className="px-2 py-1.5">
        <EditCell value={coil.tagName} placeholder="Tag ismi..."
          onChange={v => updateRow('coils', idx, 'tagName', v)} />
      </td>
      <td className="px-2 py-1.5">
        {isAdmin
          ? <EditCell value={coil.description} placeholder="Açıklama..."
              onChange={v => updateRow('coils', idx, 'description', v)} />
          : <span className="text-xs text-gray-400 italic px-2">{coil.description || '—'}</span>}
      </td>
      <td className="px-2 py-1.5">
        {hasVal
          ? <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${isOn ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isOn ? 'bg-green-500' : 'bg-red-400'}`} />{isOn ? 'ON' : 'OFF'}
            </span>
          : <span className="text-xs text-gray-300 px-2">—</span>}
      </td>
      <td className="px-2 py-1.5 text-center">
        <button onClick={() => onSelectPoint({ address: addr, tagName: coil.tagName || '', dataType: 'bit' })}
          className="text-gray-300 hover:text-blue-500 text-xs p-1 rounded hover:bg-blue-50" title="Geçmiş">▶</button>
      </td>
    </tr>
  )
})

// Register satırı — DOSYA DÜZEYİNDE + memo
const RegRow = memo(function RegRow({ reg, idx, isAdmin, ioValsRef, updateRow, onSelectPoint }) {
  const addr = reg.plcTag || `D${reg.registerAddress}`
  const currentVal = ioValsRef.current?.[addr]
  return (
    <tr className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
      <td className="px-2 py-1.5">
        {isAdmin
          ? <EditCell value={reg.plcTag} placeholder="D0" className="font-mono text-teal-700 font-bold"
              onChange={v => updateRow('dataRegisters', idx, 'plcTag', v)} />
          : <span className="font-mono text-xs font-bold text-teal-700 px-2">{reg.plcTag || '—'}</span>}
      </td>
      <td className="px-2 py-1.5">
        {isAdmin
          ? <EditCell value={reg.registerAddress} type="number" placeholder="4096"
              onChange={v => updateRow('dataRegisters', idx, 'registerAddress', parseInt(v) || 0)} />
          : <span className="text-xs text-gray-500 tabular-nums px-2">{reg.registerAddress}</span>}
      </td>
      <td className="px-2 py-1.5">
        {isAdmin
          ? <EditCell value={reg.length} type="number" placeholder="1"
              onChange={v => updateRow('dataRegisters', idx, 'length', parseInt(v) || 1)} />
          : <span className="text-xs text-gray-500 tabular-nums px-2">{reg.length ?? 1}</span>}
      </td>
      <td className="px-2 py-1.5">
        <EditCell value={reg.tagName} placeholder="Tag ismi..."
          onChange={v => updateRow('dataRegisters', idx, 'tagName', v)} />
      </td>
      <td className="px-2 py-1.5">
        {isAdmin
          ? <EditCell value={reg.description} placeholder="Açıklama..."
              onChange={v => updateRow('dataRegisters', idx, 'description', v)} />
          : <span className="text-xs text-gray-400 italic px-2">{reg.description || '—'}</span>}
      </td>
      <td className="px-2 py-1.5">
        {currentVal != null
          ? <span className="text-xs font-mono text-gray-700 bg-gray-100 px-2 py-0.5 rounded">{currentVal}</span>
          : <span className="text-xs text-gray-300 px-2">—</span>}
      </td>
      <td className="px-2 py-1.5 text-center">
        <button onClick={() => onSelectPoint({ address: addr, tagName: reg.tagName || '', dataType: 'word' })}
          className="text-gray-300 hover:text-blue-500 text-xs p-1 rounded hover:bg-blue-50" title="Geçmiş">▶</button>
      </td>
    </tr>
  )
})

// Tag input — kendi local state'i var, focus kaybetmez
function TagInput({ addr, value, onChange }) {
  const [local, setLocal] = useState(value)
  const [focused, setFocused] = useState(false)
  const ref = useRef(null)

  // Dışarıdan gelen value değişirse sync et — AMA sadece focus yokken
  useEffect(() => {
    if (!focused) setLocal(value)
  }, [value, focused])

  return (
    <input
      ref={ref}
      type="text"
      placeholder="Tag ismi girin..."
      className="flex-1 px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
      value={local}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setLocal(e.target.value)
        onChange(addr, e.target.value)
      }}
    />
  )
}

function PlcViewInner({ deviceId, plcIoConfig, modbusConfig, isAdmin, onSaveIoConfig, onDirtyChange, ioCurrentValues }) {
  // Tek kaynak: localCfg — tüm düzenleme buradan yapılır
  const [localCfg, setLocalCfg] = useState(() => normalizeConfig(plcIoConfig))
  const snapshotRef = useRef(JSON.stringify(normalizeConfig(plcIoConfig)))
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [selectedPoint, setSelectedPoint] = useState(null)

  // Dışarıdan plcIoConfig değişirse (başka sekmeden kayıt gibi) — sadece dirty değilse güncelle
  useEffect(() => {
    if (!dirty) {
      const fresh = normalizeConfig(plcIoConfig)
      setLocalCfg(fresh)
      snapshotRef.current = JSON.stringify(fresh)
    }
  }, [plcIoConfig]) // eslint-disable-line react-hooks/exhaustive-deps

  // Canlı I/O değerleri
  const ioValsRef = useRef(ioCurrentValues)
  const [ioValsVersion, setIoValsVersion] = useState(0)
  useEffect(() => { ioValsRef.current = ioCurrentValues; setIoValsVersion(v => v + 1) }, [ioCurrentValues])

  // Hücre değeri güncelleme
  const updateRow = useCallback((section, idx, field, val) => {
    setLocalCfg(prev => {
      const rows = [...(prev[section] || [])]
      rows[idx] = { ...rows[idx], [field]: val }
      const next = { ...prev, [section]: rows }
      const isDirty = JSON.stringify(next) !== snapshotRef.current
      setDirty(isDirty)
      onDirtyChange?.(isDirty)
      return next
    })
  }, [onDirtyChange])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await onSaveIoConfig(localCfg)
      snapshotRef.current = JSON.stringify(localCfg)
      setDirty(false)
      onDirtyChange?.(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch { /* sessiz */ } finally {
      setSaving(false)
    }
  }, [localCfg, onSaveIoConfig, onDirtyChange])

  // Coil satırı — dosya seviyesinde tanımlı

    // Register satırı — dosya seviyesinde tanımlı

    if (selectedPoint) {
    return (
      <IOPointHistoryPanel
        deviceId={deviceId}
        address={selectedPoint.address}
        tagName={selectedPoint.tagName}
        dataType={selectedPoint.dataType}
        isAdmin={isAdmin}
        onClose={() => setSelectedPoint(null)}
      />
    )
  }

  const coils = localCfg.coils ?? []
  const dataRegisters = localCfg.dataRegisters ?? []

  return (
    <div className="space-y-5">
      {/* Modbus */}
      {modbusConfig && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Modbus Yapılandırma</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Slave ID',   value: modbusConfig.slaveId },
              { label: 'Baud Rate',  value: modbusConfig.baudRate },
              { label: 'Data Biti',  value: modbusConfig.dataBits },
              { label: 'Stop Biti',  value: modbusConfig.stopBits },
              { label: 'Parity',     value: modbusConfig.parity?.toUpperCase() },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 rounded-xl px-3 py-2.5">
                <p className="text-xs text-gray-400">{label}</p>
                <p className="font-semibold text-gray-800">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Kaydet butonu */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          {isAdmin
            ? <span>Tablo hücrelerine tıklayarak düzenleyebilirsiniz{' '}
                <span className="text-blue-400">— Admin: tüm alanlar · Kullanıcı: yalnızca Tag İsmi</span>
              </span>
            : <span>Tag ismi sütunları düzenlenebilir</span>
          }
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`px-5 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50
            ${saved ? 'bg-green-100 text-green-700' : dirty ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-100 text-gray-500 cursor-default'}`}
        >
          {saving ? 'Kaydediliyor...' : saved ? '✓ Değişiklikler Kaydedildi' : 'Değişiklikleri Kaydet'}
        </button>
      </div>

      {/* Kaydedilmemiş değişiklik uyarısı */}
      {dirty && !saving && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-xs text-amber-700 font-medium">Kaydedilmemiş değişiklikler var — "Değişiklikleri Kaydet" ile onaylayın</span>
        </div>
      )}

      {/* Coil Listesi */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
          Coil Listesi — {coils.length} adet
        </p>
        {coils.length === 0 ? (
          <p className="text-xs text-gray-400">I/O yapılandırmasında coil tanımlanmamış.</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="max-h-96 overflow-y-auto rounded-lg border border-gray-100">
              <table className="w-full text-sm min-w-max">
                <thead className="sticky top-0 bg-gray-50 z-10">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">PLC Tag</th>
                    <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">Coil Adresi</th>
                    <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">Tag İsmi</th>
                    <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">Açıklama</th>
                    <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">Durum</th>
                    <th className="px-3 py-2 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {coils.map((coil, i) => (
                    <CoilRow key={i} coil={coil} idx={i} isAdmin={isAdmin} ioValsRef={ioValsRef} updateRow={updateRow} onSelectPoint={setSelectedPoint} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Data Register */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
          Data Register — {dataRegisters.length} adet
        </p>
        {dataRegisters.length === 0 ? (
          <p className="text-xs text-gray-400">I/O yapılandırmasında data register tanımlanmamış.</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="max-h-96 overflow-y-auto rounded-lg border border-gray-100">
              <table className="w-full text-sm min-w-max">
                <thead className="sticky top-0 bg-gray-50 z-10">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">PLC Tag</th>
                    <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">Reg. Adresi</th>
                    <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">Uzunluk</th>
                    <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">Tag İsmi</th>
                    <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">Açıklama</th>
                    <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">Değer</th>
                    <th className="px-3 py-2 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {dataRegisters.map((reg, i) => (
                    <RegRow key={i} reg={reg} idx={i} isAdmin={isAdmin} ioValsRef={ioValsRef} updateRow={updateRow} onSelectPoint={setSelectedPoint} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function DeviceHistoryPage({ menuItems }) {
  const { deviceId } = useParams()
  const navigate = useNavigate()
  const { role } = useAuth()
  const { companies, updateDevice, fetchCompanies } = useCompanyStore()
  const isAdmin = role === 'admin'

  const device = useMemo(() => {
    for (const c of companies) {
      for (const l of c.locations) {
        const d = l.devices.find((d) => d.id === deviceId)
        if (d) return { ...d, locationName: l.name, companyName: c.displayName, companyId: c.id, locationId: l.id }
      }
    }
    return null
  }, [companies, deviceId])

  const isPLC = device?.deviceType === 'plc'

  // PLC I/O noktalarının mevcut değerlerini backend'den çek + WebSocket ile canlı güncelle
  const [ioCurrentValues, setIoCurrentValues] = useState({})
  const ioValuesRef = useRef({})

  // Backend'den son PLC verisini çek
  useEffect(() => {
    if (!isPLC || !deviceId) return
    let active = true

    const fetchLatest = async () => {
      try {
        const res = await fetchDeviceData(deviceId, { limit: 1 })
        if (!active) return
        const latest = res?.latest?.data
        if (latest) {
          const vals = {}
          // Yeni format: coils (bit address bazlı)
          if (latest.coils) {
            for (const [addr, v] of Object.entries(latest.coils)) {
              vals[addr] = v
            }
          }
          // Data registers
          if (latest.dataRegisters) {
            for (const [addr, obj] of Object.entries(latest.dataRegisters)) {
              vals[addr] = typeof obj === 'object' ? obj.value : obj
            }
          }
          ioValuesRef.current = vals
          setIoCurrentValues(vals)
        }
      } catch { /* ignore */ }
    }

    fetchLatest()
    return () => { active = false }
  }, [isPLC, deviceId])

  // WebSocket ile PLC canlı veri güncelleme
  useEffect(() => {
    if (!isPLC || !deviceId) return
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/ws/device/${deviceId}`
    let active = true
    let wsObj = null
    let retryTimer = null

    function connect() {
      if (!active) return
      try {
        wsObj = new WebSocket(url)
        wsObj.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data)
            if (msg.type === 'new_data' && msg.record?.data) {
              const d = msg.record.data
              const updated = { ...ioValuesRef.current }
              if (d.coils) Object.entries(d.coils).forEach(([k, v]) => { updated[k] = v })
              if (d.dataRegisters) Object.entries(d.dataRegisters).forEach(([k, v]) => { updated[k] = typeof v === 'object' ? v.value : v })
              ioValuesRef.current = updated
              setIoCurrentValues({ ...updated })
            }
          } catch { /* ignore */ }
        }
        wsObj.onclose = () => { if (active) retryTimer = setTimeout(connect, 3000) }
        wsObj.onerror = () => wsObj.close()
      } catch {
        if (active) retryTimer = setTimeout(connect, 3000)
      }
    }

    connect()

    // Polling fallback — 3 saniyede bir
    const poll = setInterval(async () => {
      if (!active) return
      try {
        const res = await fetchDeviceData(deviceId, { limit: 1 })
        const latest = res?.latest?.data
        if (latest) {
          const vals = { ...ioValuesRef.current }
          if (latest.coils) Object.entries(latest.coils).forEach(([k, v]) => { vals[k] = v })
          if (latest.dataRegisters) Object.entries(latest.dataRegisters).forEach(([k, v]) => { vals[k] = typeof v === 'object' ? v.value : v })
          ioValuesRef.current = vals
          setIoCurrentValues({ ...vals })
        }
      } catch { /* ignore */ }
    }, 3000)

    return () => {
      active = false
      clearInterval(poll)
      if (retryTimer) clearTimeout(retryTimer)
      if (wsObj) { wsObj.onclose = null; wsObj.close() }
    }
  }, [isPLC, deviceId])

  const [plcDirty, setPlcDirty] = useState(false)
  const [showPlcLeaveWarning, setShowPlcLeaveWarning] = useState(false)
  const [showJsonModal, setShowJsonModal] = useState(false)

  const handleGoBack = () => {
    if (isPLC && plcDirty && isAdmin) { setShowPlcLeaveWarning(true) }
    else { navigate(-1) }
  }

  // Stable callback refs — PlcView'in re-mount olmasını engeller
  const saveTagsRef = useRef()
  saveTagsRef.current = async (tags) => {
    // 1. ioTags'ı güncelle (geriye dönük uyumluluk)
    // 2. plcIoConfig içindeki tagName'leri de güncelle — senkronizasyon için
    const currentDevice = device
    if (!currentDevice) return

    const currentIo = currentDevice.plcIoConfig
    if (currentIo) {
      const updatedCoils = (currentIo.coils || []).map(coil => {
        const addr = coil.plcTag || `coil_${coil.coilAddress}`
        return tags[addr] !== undefined ? { ...coil, tagName: tags[addr] } : coil
      })
      const updatedRegs = (currentIo.dataRegisters || []).map(reg => {
        const addr = reg.plcTag || `D${reg.registerAddress}`
        return tags[addr] !== undefined ? { ...reg, tagName: tags[addr] } : reg
      })
      const updatedIo = { ...currentIo, coils: updatedCoils, dataRegisters: updatedRegs }
      // plcIoConfig + ioTags birlikte güncelle
      await updateDevice(currentDevice.companyId, currentDevice.locationId, currentDevice.id, {
        ioTags: tags,
        plcIoConfig: updatedIo,
      })
    } else {
      await updateDevice(currentDevice.companyId, currentDevice.locationId, currentDevice.id, { ioTags: tags })
    }
  }
  const stableSaveTags = useCallback((tags) => saveTagsRef.current(tags), [])

  const saveIoConfigRef = useRef()
  saveIoConfigRef.current = async (newIoConfig) => {
    // 1. Backend'e kaydet (plcIoConfig değişince _notify_esp32_if_linked tetiklenir)
    await updateDevice(device?.companyId, device?.locationId, device?.id, { plcIoConfig: newIoConfig })
    // 2. Store'u yenile (izleme sayfasının cfg'i güncel olsun)
    await fetchCompanies()
  }
  const stableSaveIoConfig = useCallback((cfg) => saveIoConfigRef.current(cfg), [])

  const dirtyRef = useRef()
  dirtyRef.current = setPlcDirty
  const stableDirtyChange = useCallback((v) => dirtyRef.current(v), [])

  if (!device) return (
    <AppLayout menuItems={menuItems}><p className="text-gray-500">Cihaz bulunamadı.</p></AppLayout>
  )

  return (
    <AppLayout menuItems={menuItems}>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={handleGoBack} className="p-2 rounded-xl hover:bg-gray-100">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              {isPLC ? <Cpu size={20} className="text-purple-500" /> : <BarChart2 size={20} className="text-blue-500" />}
              {device.tagName}
            </h1>
            <p className="text-gray-500 text-sm">
              {device.id} · {device.locationName} · {device.companyName}
              {device.subtype && <span className="ml-2 text-xs bg-gray-100 px-2 py-0.5 rounded-full">{device.subtype.toUpperCase().replace('_', '-')}</span>}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => {
                const link = document.createElement('a')
                link.href = `/api/export/${deviceId}`
                link.download = `${deviceId}_export.xlsx`
                link.click()
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-50 hover:bg-green-100 text-green-600 text-xs font-medium transition-colors"
              title="Verileri Excel olarak indir"
            >
              <Download size={14} /> Excel
            </button>
            <button
              onClick={() => window.open(`/api/report/${deviceId}`, '_blank')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-600 text-xs font-medium transition-colors"
              title="Günlük rapor oluştur"
            >
              <FileText size={14} /> Rapor
            </button>
            <button
              onClick={() => setShowJsonModal(true)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors"
              title="Veri gönderim formatını görüntüle"
            >
              <HelpCircle size={18} />
            </button>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full
              ${device.status === 'online' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
              {device.status === 'online' ? 'Aktif' : 'Pasif'}
            </span>
          </div>
        </div>

        {!isPLC ? (
            <SensorView device={device} deviceId={deviceId} isAdmin={isAdmin} />
        ) : (
          <PlcViewInner
            key={device.id}
            deviceId={device.id}
            plcIoConfig={device.plcIoConfig}
            modbusConfig={device.modbusConfig}
            isAdmin={isAdmin}
            onSaveIoConfig={stableSaveIoConfig}
            onDirtyChange={stableDirtyChange}
            ioCurrentValues={ioCurrentValues}
          />
        )}


      </div>

      {showPlcLeaveWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <p className="font-semibold text-gray-900">Tag isimlerinde değişiklik yapıldı</p>
            <p className="text-sm text-gray-500">Kaydedilmemiş değişiklikler kaybolacak. Çıkmak istediğinize emin misiniz?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowPlcLeaveWarning(false)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50">Kal</button>
              <button onClick={() => { setShowPlcLeaveWarning(false); navigate(-1) }}
                className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium">Çık</button>
            </div>
          </div>
        </div>
      )}

      {showJsonModal && (
        <DeviceJsonInfoModal
          device={device}
          company={{ id: device.companyId, displayName: device.companyName }}
          location={{ id: device.locationId, name: device.locationName }}
          onClose={() => setShowJsonModal(false)}
        />
      )}
    </AppLayout>
  )
}
