import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { ArrowLeft, Trash2, Filter, RefreshCw, TrendingUp, Download } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar } from 'recharts'
import ConfirmDialog from './ConfirmDialog'
import AlarmPanel from './AlarmPanel'
import axios from 'axios'

const PAGE_SIZE_OPTIONS = [50, 100, 200]
const ADMIN_PASSWORD = 'admin123'

function DigitalBadge({ value }) {
  const isOn = value === '1' || value === 'true' || value === true
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold
      ${isOn ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isOn ? 'bg-green-500' : 'bg-red-500'}`} />
      {isOn ? 'ON' : 'OFF'}
    </span>
  )
}

export default function IOPointHistoryPanel({ deviceId, address, tagName, dataType, isAdmin, onClose }) {
  const [records, setRecords] = useState([])
  const [total, setTotal] = useState(0)
  const [filtered, setFiltered] = useState(0)
  const [loading, setLoading] = useState(true)
  const [pageSize, setPageSize] = useState(50)
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const activeRef = useRef(true)

  const isBit = dataType === 'bit'

  const loadData = useCallback(async () => {
    try {
      const params = { limit: pageSize }
      if (filterFrom) params.from = filterFrom
      if (filterTo) params.to = filterTo
      const res = await axios.get(`/api/io-history/${deviceId}/${address}`, { params })
      if (activeRef.current) {
        setRecords(res.data.records ?? [])
        setTotal(res.data.total ?? 0)
        setFiltered(res.data.filtered ?? res.data.total ?? 0)
        setLoading(false)
      }
    } catch {
      setLoading(false)
    }
  }, [deviceId, address, pageSize, filterFrom, filterTo])

  useEffect(() => {
    activeRef.current = true
    loadData()
    const interval = setInterval(loadData, 3000)
    return () => { activeRef.current = false; clearInterval(interval) }
  }, [loadData])

  const handleDelete = async () => {
    await axios.delete(`/api/io-history/${deviceId}/${address}`)
    setShowDeleteConfirm(false)
    loadData()
  }

  const getAddressType = () => {
    if (address.startsWith('X')) return 'Dijital Giriş'
    if (address.startsWith('Y')) return 'Dijital Çıkış'
    if (address.startsWith('AI')) return 'Analog Giriş'
    if (address.startsWith('AO')) return 'Analog Çıkış'
    if (address.startsWith('D')) return 'Data Register'
    return ''
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <span className="font-mono">{address}</span>
            {tagName && <span className="text-gray-500 font-normal">— {tagName}</span>}
          </h2>
          <p className="text-xs text-gray-400">{getAddressType()} · {deviceId}</p>
        </div>
        <button
          onClick={() => {
            const link = document.createElement('a')
            link.href = `/api/export/${deviceId}`
            link.download = `${deviceId}_export.xlsx`
            link.click()
          }}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-green-50 hover:bg-green-100 text-green-600 text-xs font-medium transition-colors shrink-0"
          title="Verileri Excel olarak indir"
        >
          <Download size={14} /> Excel
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Filter size={15} /><span className="font-medium">Filtrele</span>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Başlangıç</label>
            <input type="datetime-local" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Bitiş</label>
            <input type="datetime-local" value={filterTo} onChange={(e) => setFilterTo(e.target.value)}
         
     className="px-3 py-1.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
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
          {isAdmin && total > 0 && (
            <button onClick={() => setShowDeleteConfirm(true)}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-600 rounded-xl text-sm hover:bg-red-50 mt-auto">
              <Trash2 size={13} /> Tüm Geçmişi Sil
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
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

      {/* Grafik */}
      {records.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={16} className={isBit ? 'text-green-500' : 'text-purple-500'} />
            <p className="text-sm font-semibold text-gray-700">{address} Geçmiş Grafiği</p>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            {isBit ? (
              <BarChart data={[...records].reverse().map((r) => ({
                time: new Date(r.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                value: r.value === '1' ? 1 : 0,
                label: r.value === '1' ? 'ON' : 'OFF',
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#9ca3af' }} interval="preserveStartEnd" />
                <YAxis domain={[0, 1]} ticks={[0, 1]} tickFormatter={(v) => v === 1 ? 'ON' : 'OFF'} tick={{ fontSize: 10, fill: '#9ca3af' }} width={40} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '12px' }} formatter={(v) => [v === 1 ? 'ON' : 'OFF', 'Durum']} />
                <Bar dataKey="value" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : (
              <AreaChart data={[...records].reverse().map((r) => ({
                time: new Date(r.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                value: parseFloat(r.value) || 0,
              }))}>
                <defs>
                  <linearGradient id={`grad-${address}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#9ca3af' }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} width={50} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '12px' }} formatter={(v) => [v, 'Değer']} />
                <Area type="monotone" dataKey="value" stroke="#8b5cf6" strokeWidth={2} fill={`url(#grad-${address})`} dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      )}

      {/* Alarm Paneli — dijital olmayan noktalar için */}
      {!isBit && (
        <AlarmPanel
          deviceId={deviceId}
          address={address}
          label={`${address}${tagName ? ` — ${tagName}` : ''}`}
          isAdmin={isAdmin}
          unit=""
          chartData={records.length > 0 ? [...records].reverse().map((r) => ({
            time: new Date(r.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            value: parseFloat(r.value) || 0,
          })) : []}
        />
      )}

      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-500">#</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Değer</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Tarih</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Saat</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="text-center py-12 text-gray-400">Yükleniyor...</td></tr>
            ) : records.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-12 text-gray-400">Kayıt bulunamadı</td></tr>
            ) : records.map((r, i) => {
              const dt = new Date(r.timestamp)
              return (
                <tr key={r.id ?? i} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{i + 1}</td>
                  <td className="px-4 py-2.5">
                    {isBit ? <DigitalBadge value={r.value} /> : (
                      <span className="font-semibold text-gray-800">{r.value}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{isNaN(dt) ? '-' : dt.toLocaleDateString('tr-TR')}</td>
                  <td className="px-4 py-2.5 text-gray-600 font-mono text-xs">{isNaN(dt) ? '-' : dt.toLocaleTimeString('tr-TR')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Tüm Geçmişi Sil"
          message={`"${address}${tagName ? ` — ${tagName}` : ''}" noktasına ait tüm geçmiş veriler silinecek.`}
          requirePassword
          onPasswordVerify={(pw) => pw === ADMIN_PASSWORD}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  )
}
