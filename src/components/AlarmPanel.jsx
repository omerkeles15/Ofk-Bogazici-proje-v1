import { useState, useEffect, useCallback, useRef } from 'react'
import { Bell, BellOff, Settings, Trash2, AlertTriangle } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from 'recharts'
import axios from 'axios'

/**
 * AlarmPanel — Alarm limit ayarlama + alarm geçmişi + grafikte alarm noktaları
 * Hem sensör hem PLC I/O noktaları için kullanılır.
 * @param {string} deviceId
 * @param {string} address — sensör için "value", PLC için "X0","D0" vs.
 * @param {string} label — gösterim adı
 * @param {boolean} isAdmin
 * @param {Array} chartData — [{time, value, fullTime}] grafik verisi
 * @param {string} unit — birim
 */
export default function AlarmPanel({ deviceId, address, label, isAdmin, chartData, unit }) {
  const [config, setConfig] = useState({ minValue: null, maxValue: null, enabled: true })
  const [logs, setLogs] = useState([])
  const [totalLogs, setTotalLogs] = useState(0)
  const [showSettings, setShowSettings] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const [minInput, setMinInput] = useState('')
  const [maxInput, setMaxInput] = useState('')
  const [logPage, setLogPage] = useState(0)
  const logsPerPage = 50
  const activeRef = useRef(true)

  const loadConfig = useCallback(async () => {
    try {
      const res = await axios.get(`/api/alarm-config/${deviceId}/${address}`)
      setConfig(res.data)
      setMinInput(res.data.minValue != null ? String(res.data.minValue) : '')
      setMaxInput(res.data.maxValue != null ? String(res.data.maxValue) : '')
    } catch { /* ignore */ }
  }, [deviceId, address])

  const loadLogs = useCallback(async () => {
    try {
      const res = await axios.get(`/api/alarm-logs/${deviceId}/${address}?limit=${logsPerPage}&offset=${logPage * logsPerPage}`)
      if (activeRef.current) {
        setLogs(res.data.records ?? [])
        setTotalLogs(res.data.total ?? 0)
      }
    } catch { /* ignore */ }
  }, [deviceId, address, logPage])

  useEffect(() => {
    activeRef.current = true
    loadConfig()
    loadLogs()
    const interval = setInterval(loadLogs, 5000)
    return () => { activeRef.current = false; clearInterval(interval) }
  }, [loadConfig, loadLogs])

  const saveConfig = async () => {
    await axios.put(`/api/alarm-config/${deviceId}/${address}`, {
      minValue: minInput !== '' ? parseFloat(minInput) : null,
      maxValue: maxInput !== '' ? parseFloat(maxInput) : null,
      enabled: config.enabled,
    })
    await loadConfig()
    await loadLogs()
    setShowSettings(false)
    setShowLogs(true)
  }

  const clearLogs = async () => {
    await axios.delete(`/api/alarm-logs/${deviceId}/${address}`)
    loadLogs()
  }

  const hasAlarm = config.minValue != null || config.maxValue != null
  const activeAlarms = logs.filter((l) => {
    const age = Date.now() - new Date(l.timestamp).getTime()
    return age < 60000 // Son 1 dakika
  })

  return (
    <div className="space-y-3">
      {/* Alarm başlık barı */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${activeAlarms.length > 0 ? 'bg-red-100' : hasAlarm ? 'bg-amber-50' : 'bg-gray-50'}`}>
            {activeAlarms.length > 0 ? <Bell size={18} className="text-red-500 animate-pulse" /> : <BellOff size={18} className="text-gray-400" />}
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-700">Alarm Yapılandırması</p>
            <p className="text-xs text-gray-400">
              {hasAlarm
                ? `Min: ${config.minValue ?? '—'} · Max: ${config.maxValue ?? '—'} ${unit || ''}`
                : 'Alarm limiti tanımlanmamış'}
            </p>
          </div>
          {activeAlarms.length > 0 && (
            <span className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-semibold animate-pulse">
              <AlertTriangle size={12} /> {activeAlarms.length} Aktif
            </span>
          )}
          <button onClick={() => setShowLogs(!showLogs)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${showLogs ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {totalLogs > 0 ? `Alarmlar (${totalLogs})` : 'Alarmlar'}
          </button>
          {isAdmin && (
            <button onClick={() => setShowSettings(!showSettings)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600">
              <Settings size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Alarm ayarları */}
      {showSettings && isAdmin && (
        <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-4 space-y-3">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Alarm Limitleri</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Minimum Alarm</label>
              <input type="number" step="any" value={minInput} onChange={(e) => setMinInput(e.target.value)}
                placeholder="Örn: 50" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Maksimum Alarm</label>
              <input type="number" step="any" value={maxInput} onChange={(e) => setMaxInput(e.target.value)}
                placeholder="Örn: 100" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={saveConfig} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium">Kaydet</button>
            <button onClick={() => setShowSettings(false)} className="px-4 py-2 border border-gray-200 rounded-xl text-sm">İptal</button>
          </div>
        </div>
      )}

      {/* Grafikte alarm çizgileri */}
      {hasAlarm && chartData && chartData.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-500 mb-3">Alarm Grafiği</p>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="alarmGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#9ca3af' }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} width={45} />
              <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '11px' }} />
              {config.maxValue != null && <ReferenceLine y={config.maxValue} stroke="#ef4444" strokeDasharray="5 5" label={{ value: `Max: ${config.maxValue}`, position: 'right', fontSize: 10, fill: '#ef4444' }} />}
              {config.minValue != null && <ReferenceLine y={config.minValue} stroke="#3b82f6" strokeDasharray="5 5" label={{ value: `Min: ${config.minValue}`, position: 'right', fontSize: 10, fill: '#3b82f6' }} />}
              <Area type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={2} fill="url(#alarmGrad)" dot={(props) => {
                const { cx, cy, payload } = props
                const v = payload.value
                const isAlarm = (config.maxValue != null && v > config.maxValue) || (config.minValue != null && v < config.minValue)
                if (!isAlarm) return null
                return <circle cx={cx} cy={cy} r={5} fill="#ef4444" stroke="#fff" strokeWidth={2} />
              }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Alarm geçmişi tablosu */}
      {showLogs && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Alarm Geçmişi</p>
            {isAdmin && totalLogs > 0 && (
              <button onClick={clearLogs} className="flex items-center gap-1 px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded-lg">
                <Trash2 size={12} /> Temizle
              </button>
            )}
          </div>
          {logs.length === 0 ? (
            <p className="text-center py-6 text-gray-400 text-sm">Alarm kaydı yok</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-3 py-2 font-medium text-gray-500">#</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Tip</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Değer</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Limit</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Tarih</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Saat</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l, i) => {
                    const dt = new Date(l.timestamp)
                    return (
                      <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-400">{logPage * logsPerPage + i + 1}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${l.alarmType === 'max' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                            {l.alarmType === 'max' ? '▲ Maks' : '▼ Min'}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-semibold text-gray-800">{l.value} {unit}</td>
                        <td className="px-3 py-2 text-gray-500">{l.limitValue} {unit}</td>
                        <td className="px-3 py-2 text-gray-600">{isNaN(dt) ? '-' : dt.toLocaleDateString('tr-TR')}</td>
                        <td className="px-3 py-2 text-gray-600 font-mono">{isNaN(dt) ? '-' : dt.toLocaleTimeString('tr-TR')}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {/* Sayfalama */}
          {totalLogs > logsPerPage && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-gray-400">
                {logPage * logsPerPage + 1}–{Math.min((logPage + 1) * logsPerPage, totalLogs)} / {totalLogs} alarm
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setLogPage(0)}
                  disabled={logPage === 0}
                  className="px-2 py-1 text-xs rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30"
                >İlk</button>
                <button
                  onClick={() => setLogPage((p) => Math.max(0, p - 1))}
                  disabled={logPage === 0}
                  className="px-2 py-1 text-xs rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30"
                >◀</button>
                <span className="px-3 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded-lg">
                  {logPage + 1} / {Math.ceil(totalLogs / logsPerPage)}
                </span>
                <button
                  onClick={() => setLogPage((p) => Math.min(Math.ceil(totalLogs / logsPerPage) - 1, p + 1))}
                  disabled={logPage >= Math.ceil(totalLogs / logsPerPage) - 1}
                  className="px-2 py-1 text-xs rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30"
                >▶</button>
                <button
                  onClick={() => setLogPage(Math.ceil(totalLogs / logsPerPage) - 1)}
                  disabled={logPage >= Math.ceil(totalLogs / logsPerPage) - 1}
                  className="px-2 py-1 text-xs rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30"
                >Son</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
