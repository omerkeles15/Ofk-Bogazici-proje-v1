import { useState, useEffect, memo, useCallback } from 'react'
import { normalizeConfig, resizeArray, DEFAULT_COIL_ROW, DEFAULT_REGISTER_ROW, getWordSize, computeAutoAddresses, computeAutoCoilAddresses, computeTotalWords, clampValue } from '../features/device/plcIoUtils'
import { DATA_TYPE_OPTIONS, DEFAULT_MODBUS_TIMING } from '../features/device/deviceCatalog'

// ─── Satır İçi Düzenlenebilir Hücre (memo ile) ─────────────
const IoCell = memo(function IoCell({ value, onChange, type = 'text', readOnly = false, options, placeholder = '', className = '' }) {
  const [local, setLocal] = useState(String(value ?? ''))
  const [focused, setFocused] = useState(false)
  useEffect(() => { if (!focused) setLocal(String(value ?? '')) }, [value, focused])

  if (readOnly) {
    return <span className={`px-2 py-1 text-xs text-gray-500 ${className}`}>{value ?? '—'}</span>
  }

  if (type === 'select' && options) {
    return (
      <select
        value={local}
        onChange={e => { setLocal(e.target.value); onChange(e.target.value) }}
        className={`px-1.5 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white cursor-pointer ${className}`}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label} — {opt.desc}
          </option>
        ))}
      </select>
    )
  }

  return (
    <input
      type={type}
      value={local}
      placeholder={placeholder}
      readOnly={readOnly}
      className={`px-2 py-1 border border-transparent rounded focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-300 bg-transparent hover:bg-white hover:border-gray-200 text-xs transition-colors ${className}`}
      style={{ minWidth: type === 'number' ? '64px' : '80px' }}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); onChange(type === 'number' ? (local === '' ? 0 : Number(local)) : local) }}
      onChange={e => setLocal(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
    />
  )
})

// ─── IoSection ──────────────────────────────────────────────
function IoSection({ title, accentColor = 'purple', rows, columns, defaultRow, onChange, badge }) {
  const count = rows.length

  const handleCountChange = (e) => {
    const val = e.target.value
    if (val === '' || val === '0') { onChange([]); return }
    const n = parseInt(val, 10)
    if (!isNaN(n) && n >= 0) onChange(resizeArray(rows, n, defaultRow))
  }

  const handleCellChange = (rowIdx, key, value) => {
    const updated = rows.map((r, i) => i === rowIdx ? { ...r, [key]: value } : r)
    onChange(updated)
  }

  const handleRemoveRow = (rowIdx) => {
    onChange(rows.filter((_, i) => i !== rowIdx))
  }

  const colors = {
    purple: { border: 'border-purple-100', bg: 'bg-purple-50/30', label: 'text-purple-700', ring: 'focus:ring-purple-400' },
    blue:   { border: 'border-blue-100',   bg: 'bg-blue-50/30',   label: 'text-blue-700',   ring: 'focus:ring-blue-400' },
    teal:   { border: 'border-teal-100',   bg: 'bg-teal-50/30',   label: 'text-teal-700',   ring: 'focus:ring-teal-400' },
  }
  const c = colors[accentColor] || colors.purple

  return (
    <div className={`border ${c.border} rounded-xl p-4 space-y-3 ${c.bg}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className={`text-xs font-semibold ${c.label} uppercase tracking-wide`}>{title}</p>
          {badge && <span className="text-xs bg-white border border-gray-200 rounded-full px-2 py-0.5 text-gray-600 font-medium">{badge}</span>}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Adet:</label>
          <input type="number" min="0" max="200" value={count} onChange={handleCountChange}
            className={`w-16 px-2 py-1 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 ${c.ring}`} />
        </div>
      </div>

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-100">
            <table className="w-full text-xs min-w-max">
              <thead className="sticky top-0 bg-gray-50 z-10">
                <tr>
                  <th className="px-2 py-1.5 text-left text-gray-500 font-medium w-6">#</th>
                  {columns.map(col => (
                    <th key={col.key} className="px-2 py-1.5 text-left text-gray-500 font-medium whitespace-nowrap">{col.label}</th>
                  ))}
                  <th className="px-2 py-1.5 w-6" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIdx) => (
                  <tr key={rowIdx} className="border-t border-gray-50 hover:bg-white/60">
                    <td className="px-2 py-1 text-gray-400 tabular-nums">{rowIdx + 1}</td>
                    {columns.map(col => (
                      <td key={col.key} className="px-1 py-1">
                        <IoCell
                          value={row[col.key] ?? (col.type === 'number' ? 0 : '')}
                          type={col.type}
                          readOnly={typeof col.readOnly === 'function' ? col.readOnly(rowIdx) : col.readOnly}
                          options={col.options}
                          placeholder={col.placeholder || ''}
                          className={col.className || ''}
                          onChange={v => handleCellChange(rowIdx, col.key, v)}
                        />
                      </td>
                    ))}
                    <td className="px-1 py-1 text-center">
                      <button type="button" onClick={() => handleRemoveRow(rowIdx)}
                        className="text-red-400 hover:text-red-600 font-bold leading-none" title="Sil">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {rows.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-2">Adet alanına sayı girerek satır ekleyin</p>
      )}
    </div>
  )
}

// ─── Sütun Tanımları ────────────────────────────────────────
const COIL_COLUMNS = [
  { key: 'plcTag',      label: 'PLC Tag',     type: 'text',   readOnly: true, className: 'font-mono text-purple-700 font-bold' },
  { key: 'coilAddress', label: 'Coil Adresi', type: 'number', readOnly: (idx) => idx > 0 },
  { key: 'tagName',     label: 'Tag İsmi',    type: 'text',   placeholder: 'Tag ismi...' },
  { key: 'description', label: 'Açıklama',    type: 'text',   placeholder: 'Açıklama...' },
]

const REGISTER_COLUMNS = [
  { key: 'plcTag',          label: 'PLC Tag',     type: 'text',   readOnly: true, className: 'font-mono text-teal-700 font-bold' },
  { key: 'registerAddress', label: 'Reg. Adresi', type: 'number', readOnly: (idx) => idx > 0 },
  { key: 'dataType',        label: 'Veri Tipi',   type: 'select', options: DATA_TYPE_OPTIONS },
  { key: 'tagName',         label: 'Tag İsmi',    type: 'text',   placeholder: 'Tag ismi...' },
  { key: 'description',     label: 'Açıklama',    type: 'text',   placeholder: 'Açıklama...' },
]

// ─── Ana Bileşen ────────────────────────────────────────────
export default function PlcIoConfigForm({ value, onChange }) {
  const config = normalizeConfig(value)

  // Data registers her değiştiğinde otomatik adres hesapla
  const handleRegisterChange = useCallback((rows) => {
    const startAddr = rows.length > 0 ? (rows[0].registerAddress || 4096) : 4096
    const computed = computeAutoAddresses(rows, startAddr)
    onChange({ ...config, dataRegisters: computed })
  }, [config, onChange])

  const handleCoilChange = useCallback((rows) => {
    const startAddr = rows.length > 0 ? (rows[0].coilAddress || 2048) : 2048
    const computed = computeAutoCoilAddresses(rows, startAddr)
    onChange({ ...config, coils: computed })
  }, [config, onChange])

  const totalWords = computeTotalWords(config.dataRegisters)

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide">I/O Yapılandırma</p>

      <IoSection
        title="Coil Listesi (M0, M1, M2...)"
        accentColor="purple"
        rows={config.coils}
        columns={COIL_COLUMNS}
        defaultRow={DEFAULT_COIL_ROW}
        onChange={handleCoilChange}
        badge={config.coils.length > 0 ? `${config.coils.length} Bit` : null}
      />

      <IoSection
        title="Data Register (D)"
        accentColor="teal"
        rows={config.dataRegisters}
        columns={REGISTER_COLUMNS}
        defaultRow={DEFAULT_REGISTER_ROW}
        onChange={handleRegisterChange}
        badge={totalWords > 0 ? `${totalWords} Word` : null}
      />
    </div>
  )
}
