import { normalizeConfig, resizeArray, DEFAULT_COIL_ROW, DEFAULT_REGISTER_ROW } from '../features/device/plcIoUtils'

/** Tek bir I/O bölümü (Coil / Analog / Register) */
function IoSection({ title, accentColor = 'purple', rows, columns, defaultRow, onChange }) {
  const count = rows.length

  const handleCountChange = (e) => {
    const val = e.target.value
    if (val === '' || val === '0') {
      onChange([])
      return
    }
    const n = parseInt(val, 10)
    if (!isNaN(n) && n >= 0) {
      onChange(resizeArray(rows, n, defaultRow))
    }
  }

  const handleCellChange = (rowIdx, key, value) => {
    const updated = rows.map((r, i) =>
      i === rowIdx ? { ...r, [key]: value } : r
    )
    onChange(updated)
  }

  const handleRemoveRow = (rowIdx) => {
    onChange(rows.filter((_, i) => i !== rowIdx))
  }

  const colors = {
    purple: { border: 'border-purple-100', bg: 'bg-purple-50/30', label: 'text-purple-700', ring: 'focus:ring-purple-400' },
    blue:   { border: 'border-blue-100',   bg: 'bg-blue-50/30',   label: 'text-blue-700',   ring: 'focus:ring-blue-400'   },
    teal:   { border: 'border-teal-100',   bg: 'bg-teal-50/30',   label: 'text-teal-700',   ring: 'focus:ring-teal-400'   },
  }
  const c = colors[accentColor] || colors.purple

  return (
    <div className={`border ${c.border} rounded-xl p-4 space-y-3 ${c.bg}`}>
      {/* Başlık + Adet */}
      <div className="flex items-center justify-between gap-3">
        <p className={`text-xs font-semibold ${c.label} uppercase tracking-wide`}>{title}</p>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Adet:</label>
          <input
            type="number"
            min="0"
            max="200"
            value={count}
            onChange={handleCountChange}
            className={`w-16 px-2 py-1 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 ${c.ring}`}
          />
        </div>
      </div>

      {/* Tablo */}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-100">
            <table className="w-full text-xs min-w-max">
              <thead className="sticky top-0 bg-gray-50 z-10">
                <tr>
                  <th className="px-2 py-1.5 text-left text-gray-500 font-medium w-6">#</th>
                  {columns.map((col) => (
                    <th key={col.key} className="px-2 py-1.5 text-left text-gray-500 font-medium whitespace-nowrap">
                      {col.label}
                    </th>
                  ))}
                  <th className="px-2 py-1.5 w-6" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIdx) => (
                  <tr key={rowIdx} className="border-t border-gray-50 hover:bg-white/60">
                    <td className="px-2 py-1 text-gray-400 tabular-nums">{rowIdx + 1}</td>
                    {columns.map((col) => (
                      <td key={col.key} className="px-1 py-1">
                        <input
                          type={col.type}
                          min={col.min ?? undefined}
                          value={row[col.key] ?? (col.type === 'number' ? 0 : '')}
                          onChange={(e) =>
                            handleCellChange(
                              rowIdx,
                              col.key,
                              col.type === 'number' ? (e.target.value === '' ? 0 : Number(e.target.value)) : e.target.value
                            )
                          }
                          className={`w-full px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 ${c.ring} bg-white text-gray-800`}
                          style={{ minWidth: col.minWidth || (col.type === 'number' ? '70px' : '90px') }}
                        />
                      </td>
                    ))}
                    <td className="px-1 py-1 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(rowIdx)}
                        className="text-red-400 hover:text-red-600 font-bold leading-none"
                        title="Satırı sil"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {rows.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-2">
          Adet alanına sayı girerek satır ekleyin
        </p>
      )}
    </div>
  )
}

// ─── Sütun Tanımları ──────────────────────────────────────────
const COIL_COLUMNS = [
  { key: 'plcTag',      label: 'PLC Tag',      type: 'text',   minWidth: '70px'  },
  { key: 'coilAddress', label: 'Coil Adresi',  type: 'number', minWidth: '90px'  },
  { key: 'tagName',     label: 'Tag İsmi',     type: 'text',   minWidth: '110px' },
  { key: 'description', label: 'Açıklama',     type: 'text',   minWidth: '120px' },
]

const REGISTER_COLUMNS = [
  { key: 'plcTag',           label: 'PLC Tag',       type: 'text',   minWidth: '70px'  },
  { key: 'registerAddress',  label: 'Reg. Adresi',   type: 'number', minWidth: '90px'  },
  { key: 'length',           label: 'Uzunluk',       type: 'number', min: 1, minWidth: '70px'  },
  { key: 'tagName',          label: 'Tag İsmi',      type: 'text',   minWidth: '110px' },
  { key: 'description',      label: 'Açıklama',      type: 'text',   minWidth: '120px' },
]

// ─── Ana Bileşen ──────────────────────────────────────────────
export default function PlcIoConfigForm({ value, onChange }) {
  const config = normalizeConfig(value)

  const update = (key, rows) => {
    onChange({ ...config, [key]: rows })
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide">I/O Yapılandırma</p>

      <IoSection
        title="Coil Listesi (X, Y, M, C, T, S...)"
        accentColor="purple"
        rows={config.coils}
        columns={COIL_COLUMNS}
        defaultRow={DEFAULT_COIL_ROW}
        onChange={(rows) => update('coils', rows)}
      />

      <IoSection
        title="Data Register (D)"
        accentColor="teal"
        rows={config.dataRegisters}
        columns={REGISTER_COLUMNS}
        defaultRow={DEFAULT_REGISTER_ROW}
        onChange={(rows) => update('dataRegisters', rows)}
      />
    </div>
  )
}
