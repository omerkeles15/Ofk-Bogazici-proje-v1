import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Pencil, Eye, Network } from 'lucide-react'
import AppLayout from '../../components/Layout/AppLayout'
import Modal from '../../components/Modal'
import Table from '../../components/Table'
import FormField from '../../components/FormField'
import ConfirmDialog from '../../components/ConfirmDialog'
import { useFormValidation } from '../../hooks/useFormValidation'
import { useCompanyStore } from '../../features/company/companyStore'
import { useEsp32Store } from '../../features/esp32/esp32Store'
import { DEVICE_TYPE_OPTIONS, getSubtypes, getUnit, DEFAULT_MODBUS_CONFIG, MODBUS_OPTIONS, DEFAULT_PLC_IO_CONFIG_V2 } from '../../features/device/deviceCatalog'
import PlcIoConfigForm from '../../components/PlcIoConfigForm'
import { adminMenu } from './adminMenu'

// Toggle Switch bileşeni
function Switch({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none
        ${checked ? 'bg-green-500' : 'bg-gray-300'}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform
          ${checked ? 'translate-x-4' : 'translate-x-1'}`}
      />
    </button>
  )
}

export default function AdminCompanyDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { companies, addLocation, updateLocation, deleteLocation, addDevice, updateDevice, deleteDevice, toggleDeviceStatus, peekNextDeviceId } = useCompanyStore()
  const { devices: esp32Devices, fetchDevices: fetchEsp32Devices } = useEsp32Store()
  const company = companies.find((c) => c.id === Number(id))

  const [showLocModal, setShowLocModal] = useState(false)
  const [editLocTarget, setEditLocTarget] = useState(null)
  const [showDevModal, setShowDevModal] = useState(false)
  const [editDevTarget, setEditDevTarget] = useState(null)
  const [modbusViewDevice, setModbusViewDevice] = useState(null) // Modbus popup
  const [selectedLocId, setSelectedLocId] = useState(null)
  const [locForm, setLocForm] = useState({ name: '' })
  const [devForm, setDevForm] = useState({ tagName: '', deviceType: '', subtype: '', unit: '', modbusConfig: null, plcIoConfig: null, selectedEsp32Id: null, unitPrice: 0 })
  const [devError, setDevError] = useState('')
  const [toggleTarget, setToggleTarget] = useState(null)
  const [deleteDevTarget, setDeleteDevTarget] = useState(null) // { device, locId } — onay bekleyen toggle
  const [deleteLocTarget, setDeleteLocTarget] = useState(null) // lokasyon silme onayı

  const locValidationRules = useMemo(() => ({
    name: (v) => (!v || !v.trim()) ? 'Lokasyon adı boş bırakılamaz' : null,
  }), [])
  const { errors: locErrors, validate: validateLoc, clearErrors: clearLocErrors } = useFormValidation(locValidationRules)

  if (!company) return (
    <AppLayout menuItems={adminMenu}>
      <p className="text-gray-500">Firma bulunamadı.</p>
    </AppLayout>
  )

  const handleAddLocation = (e) => {
    e.preventDefault()
    if (!validateLoc(locForm)) return
    addLocation(company.id, { name: locForm.name })
    setLocForm({ name: '' })
    setShowLocModal(false)
  }

  const handleEditLocation = (e) => {
    e.preventDefault()
    if (!validateLoc(locForm)) return
    updateLocation(company.id, editLocTarget.id, { name: locForm.name })
    setEditLocTarget(null)
  }

  const handleAddDevice = async (e) => {
    e.preventDefault()
    setDevError('')
    const selectedEsp32 = devForm.selectedEsp32Id
    try {
      await addDevice(company.id, selectedLocId, devForm)
      // ESP32 link kur — addDevice sonrası store güncel
      if (selectedEsp32) {
        const updatedCompany = useCompanyStore.getState().companies.find(c => c.id === Number(id))
        const updatedLoc = updatedCompany?.locations.find(l => l.id === selectedLocId)
        const lastDev = updatedLoc?.devices[updatedLoc.devices.length - 1]
        if (lastDev) {
          try {
            await useEsp32Store.getState().linkDevice(selectedEsp32, lastDev.id)
          } catch {
            setDevError('Cihaz eklendi ancak ESP32 bağlantısı kurulamadı.')
          }
        }
      }
      setDevForm({ tagName: '', deviceType: '', subtype: '', unit: '', modbusConfig: null, plcIoConfig: null, selectedEsp32Id: null, unitPrice: 0 })
      setShowDevModal(false)
    } catch (err) {
      setDevError(err.message)
    }
  }

  const handleEditDevice = async (e) => {
    e.preventDefault()
    setDevError('')
    const selectedEsp32 = devForm.selectedEsp32Id
    try {
      await updateDevice(company.id, editDevTarget.locId, editDevTarget.device.id, devForm)

      // ESP32 bağlantısını güncelle
      if (selectedEsp32) {
        // Yeni bir ESP32 seçildiyse veya değiştiyse link kur
        const currentLinked = useEsp32Store.getState().devices.find(e => e.device_id === editDevTarget.device.id)
        if (!currentLinked || currentLinked.id !== selectedEsp32) {
          try {
            await useEsp32Store.getState().linkDevice(selectedEsp32, editDevTarget.device.id)
          } catch {
            setDevError('Cihaz güncellendi ancak ESP32 bağlantısı değiştirilemedi.')
          }
        }
      }

      setEditDevTarget(null)
      setDevForm({ tagName: '', deviceType: '', subtype: '', unit: '', modbusConfig: null, plcIoConfig: null, selectedEsp32Id: null, unitPrice: 0 })
    } catch (err) {
      setDevError(err.message)
    }
  }

  const deviceColumns = [
    { key: 'id', label: 'Device ID' },
    { key: 'tagName', label: 'Tag Name' },
    { key: 'unit', label: 'Birim' },
    {
      key: 'status',
      label: 'Durum',
      render: (r) => (
        <div className="flex items-center gap-2">
          <Switch
            checked={r.status === 'online'}
            onChange={() => {
              if (r.status === 'online') {
                // Aktiften pasife — onay iste
                setToggleTarget({ device: r, locId: r._locId })
              } else {
                // Pasiften aktife — direkt geç
                toggleDeviceStatus(company.id, r._locId, r.id)
              }
            }}
          />
          <span className={`text-xs font-medium ${r.status === 'online' ? 'text-green-600' : 'text-gray-400'}`}>
            {r.status === 'online' ? 'Aktif' : 'Pasif'}
          </span>
        </div>
      ),
    },
    {
      key: 'actions',
      label: '',
      render: (r) => (
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate(`/admin/device/${r.id}`)}
            className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500"
            title="Görüntüle"
          >
            <Eye size={14} />
          </button>
          {/* Modbus ikonu — sadece PLC cihazlarda */}
          {r.deviceType === 'plc' && r.modbusConfig && (
            <button
              onClick={() => setModbusViewDevice(r)}
              className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-500"
              title="Modbus Yapılandırma"
            >
              <Network size={14} />
            </button>
          )}
          <button
            onClick={() => {
              // Cihaza bağlı ESP32 ID'sini bul
              const linkedEsp32 = useEsp32Store.getState().devices.find(e => e.device_id === r.id)
              fetchEsp32Devices()
              setDevForm({
                tagName: r.tagName,
                deviceType: r.deviceType ?? '',
                subtype: r.subtype ?? '',
                unit: r.unit ?? '',
                modbusConfig: r.modbusConfig ?? null,
                plcIoConfig: r.plcIoConfig ? JSON.parse(JSON.stringify(r.plcIoConfig)) : null,
                selectedEsp32Id: linkedEsp32?.id ?? null,
                unitPrice: r.unitPrice ?? 0,
              })
              setDevError('')
              setEditDevTarget({ device: r, locId: r._locId })
            }}
            className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-500"
            title="Düzenle"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => setDeleteDevTarget({ device: r, locId: r._locId })}
            className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"
            title="Sil"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ]

  return (
    <AppLayout menuItems={adminMenu}>
      <div className="space-y-6">
        {/* Başlık */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/admin/companies')}
            className="p-2 rounded-xl hover:bg-gray-100">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold">{company.displayName}</h1>
            <p className="text-gray-500 text-sm">{company.fullName}</p>
          </div>
        </div>

        {/* Lokasyon başlığı */}
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Lokasyonlar ({company.locations.length})</h2>
          <button
            onClick={() => { setLocForm({ name: '' }); clearLocErrors(); setShowLocModal(true) }}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm"
          >
            <Plus size={14} /> Lokasyon Ekle
          </button>
        </div>

        {/* Lokasyon kartları */}
        {company.locations.map((loc) => {
          const devData = loc.devices.map((d) => ({ ...d, _locId: loc.id }))
          return (
            <div key={loc.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">{loc.name}</h3>
                <div className="flex items-center gap-2">
                  {/* Lokasyon düzenle */}
                  <button
                    onClick={() => { setLocForm({ name: loc.name }); clearLocErrors(); setEditLocTarget(loc) }}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-xl text-sm hover:bg-amber-50 hover:border-amber-200 hover:text-amber-600 transition-colors"
                  >
                    <Pencil size={13} /> Düzenle
                  </button>
                  {/* Cihaz ekle */}
                  <button
                    onClick={() => { setSelectedLocId(loc.id); setDevForm({ tagName: '', deviceType: '', subtype: '', unit: '', modbusConfig: null, plcIoConfig: null, selectedEsp32Id: null, unitPrice: 0 }); setDevError(''); fetchEsp32Devices(); setShowDevModal(true) }}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-xl text-sm hover:bg-gray-50 transition-colors"
                  >
                    <Plus size={13} /> Cihaz Ekle
                  </button>
                  {/* Lokasyon sil */}
                  <button
                    onClick={() => setDeleteLocTarget(loc)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 rounded-xl text-sm hover:bg-red-50 text-red-500 transition-colors"
                    title="Lokasyonu Sil"
                  >
                    <Trash2 size={13} /> Sil
                  </button>
                </div>
              </div>
              <Table columns={deviceColumns} data={devData} emptyText="Bu lokasyonda cihaz yok" />
            </div>
          )
        })}
      </div>

      {/* Modbus Görüntüleme Modalı */}
      {modbusViewDevice && (
        <Modal
          title={`Modbus Yapılandırma — ${modbusViewDevice.tagName}`}
          onClose={() => setModbusViewDevice(null)}
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl">
              <span className="text-xs text-gray-500 font-medium">Cihaz:</span>
              <span className="font-mono text-sm font-bold text-gray-700">{modbusViewDevice.id}</span>
              <span className="text-xs text-gray-400 ml-1">· {modbusViewDevice.subtype?.toUpperCase().replace('_', '-')}</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Slave ID',   value: modbusViewDevice.modbusConfig.slaveId },
                { label: 'Baud Rate',  value: modbusViewDevice.modbusConfig.baudRate },
                { label: 'Data Biti',  value: modbusViewDevice.modbusConfig.dataBits },
                { label: 'Stop Biti',  value: modbusViewDevice.modbusConfig.stopBits },
                { label: 'Parity',     value: modbusViewDevice.modbusConfig.parity?.toUpperCase() },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-50 rounded-xl px-4 py-3">
                  <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                  <p className="font-semibold text-gray-800">{value}</p>
                </div>
              ))}
            </div>

            <button
              onClick={() => setModbusViewDevice(null)}
              className="w-full py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50 mt-2"
            >
              Kapat
            </button>
          </div>
        </Modal>
      )}

      {/* Lokasyon Ekle Modal */}
      {showLocModal && (
        <Modal title="Lokasyon Ekle" onClose={() => setShowLocModal(false)}>
          <form onSubmit={handleAddLocation} className="space-y-4">
            <FormField label="Lokasyon Adı" error={locErrors.name} required>
              <input
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="İzmir Tire Tesisi"
                value={locForm.name}
                onChange={(e) => setLocForm({ name: e.target.value })}
              />
            </FormField>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowLocModal(false)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm">İptal</button>
              <button type="submit"
                className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium">Ekle</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Lokasyon Düzenle Modal */}
      {editLocTarget && (
        <Modal title={`Lokasyon Düzenle — ${editLocTarget.name}`} onClose={() => setEditLocTarget(null)}>
          <form onSubmit={handleEditLocation} className="space-y-4">
            <FormField label="Lokasyon Adı" error={locErrors.name} required>
              <input
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={locForm.name}
                onChange={(e) => setLocForm({ name: e.target.value })}
              />
            </FormField>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setEditLocTarget(null)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm">İptal</button>
              <button type="submit"
                className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium">Kaydet</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Cihaz Düzenle Modal */}
      {editDevTarget && (
        <Modal title={`Cihaz Düzenle — ${editDevTarget.device.tagName}`} onClose={() => { setEditDevTarget(null); setDevError('') }}>
          <form onSubmit={handleEditDevice} className="space-y-4">
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl">
              <span className="text-xs text-gray-500 font-medium">Device ID:</span>
              <span className="font-mono text-sm font-bold text-gray-700">{editDevTarget.device.id}</span>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tag Name</label>
              <input
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={devForm.tagName}
                onChange={(e) => setDevForm({ ...devForm, tagName: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Birim Fiyat (₺/ay)</label>
              <input
                type="number" min="0" step="0.01"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={devForm.unitPrice || 0}
                onChange={(e) => setDevForm({ ...devForm, unitPrice: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cihaz Tipi</label>
              <select
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={devForm.deviceType}
                onChange={(e) => setDevForm({ ...devForm, deviceType: e.target.value, subtype: '', unit: '', modbusConfig: null, plcIoConfig: null })}
              >
                <option value="">Seçiniz</option>
                {DEVICE_TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            {devForm.deviceType && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {devForm.deviceType === 'plc' ? 'Model / Seri' : 'Sensör Tipi'}
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={devForm.subtype}
                  onChange={(e) => {
                    const unit = getUnit(devForm.deviceType, e.target.value)
                    const modbusConfig = devForm.deviceType === 'plc'
                      ? (devForm.modbusConfig ?? { ...DEFAULT_MODBUS_CONFIG })
                      : null
                    const plcIoConfig = devForm.deviceType === 'plc'
                      ? (devForm.plcIoConfig ?? { ...DEFAULT_PLC_IO_CONFIG_V2 })
                      : null
                    setDevForm({ ...devForm, subtype: e.target.value, unit, modbusConfig, plcIoConfig })
                  }}
                >
                  <option value="">Seçiniz</option>
                  {getSubtypes(devForm.deviceType).map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            )}
            {devForm.unit && (
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-xl">
                <span className="text-xs text-green-600 font-medium">Birim:</span>
                <span className="font-mono text-sm font-bold text-green-700">{devForm.unit}</span>
              </div>
            )}
            {/* ESP32 Seç — düzenle modalı */}
            {devForm.deviceType && (
              <div className="border border-indigo-100 rounded-xl p-4 bg-indigo-50/30">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  🔗 Bağlı ESP32 Seç{' '}
                  <span className="text-xs text-gray-400 font-normal">(opsiyonel)</span>
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={devForm.selectedEsp32Id ?? ''}
                  onChange={(e) => setDevForm({ ...devForm, selectedEsp32Id: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">— Seçme (bağlantısız) —</option>
                  {esp32Devices
                    .filter(d => d.status === 'connected' || d.device_id === editDevTarget?.device?.id)
                    .map(d => {
                      const isCurrentDevice = d.device_id === editDevTarget?.device?.id
                      const isUsedElsewhere = d.device_id && !isCurrentDevice
                      return (
                        <option key={d.id} value={d.id} disabled={isUsedElsewhere}>
                          {d.esp32_tag} — {d.model}
                          {isCurrentDevice ? ' (mevcut)' : isUsedElsewhere ? ' (kullanımda)' : ''}
                        </option>
                      )
                    })
                  }
                </select>
                {esp32Devices.filter(d => d.status === 'connected').length === 0 && (
                  <p className="text-xs text-gray-400 mt-1">Şu an bağlı ESP32 cihazı yok</p>
                )}
              </div>
            )}
            {devForm.deviceType === 'plc' && devForm.subtype && devForm.modbusConfig && (
              <div className="border border-blue-100 rounded-xl p-4 space-y-3 bg-blue-50/40">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Modbus Yapılandırma</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Slave ID</label>
                    <input type="number" min={1} max={247}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      value={devForm.modbusConfig.slaveId}
                      onChange={(e) => setDevForm({ ...devForm, modbusConfig: { ...devForm.modbusConfig, slaveId: Number(e.target.value) } })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Baud Rate</label>
                    <select className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      value={devForm.modbusConfig.baudRate}
                      onChange={(e) => setDevForm({ ...devForm, modbusConfig: { ...devForm.modbusConfig, baudRate: Number(e.target.value) } })}>
                      {MODBUS_OPTIONS.baudRate.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Data Biti</label>
                    <select className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      value={devForm.modbusConfig.dataBits}
                      onChange={(e) => setDevForm({ ...devForm, modbusConfig: { ...devForm.modbusConfig, dataBits: Number(e.target.value) } })}>
                      {MODBUS_OPTIONS.dataBits.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Stop Biti</label>
                    <select className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      value={devForm.modbusConfig.stopBits}
                      onChange={(e) => setDevForm({ ...devForm, modbusConfig: { ...devForm.modbusConfig, stopBits: Number(e.target.value) } })}>
                      {MODBUS_OPTIONS.stopBits.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Parity</label>
                    <select className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      value={devForm.modbusConfig.parity}
                      onChange={(e) => setDevForm({ ...devForm, modbusConfig: { ...devForm.modbusConfig, parity: e.target.value } })}>
                      {MODBUS_OPTIONS.parity.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}
            {/* PLC I/O Yapılandırma — düzenle */}
            {devForm.deviceType === 'plc' && devForm.subtype && (
              <PlcIoConfigForm
                value={devForm.plcIoConfig ?? DEFAULT_PLC_IO_CONFIG_V2}
                onChange={(v) => setDevForm({ ...devForm, plcIoConfig: v })}
              />
            )}
            {devError && <p className="text-red-500 text-sm">{devError}</p>}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => { setEditDevTarget(null); setDevError('') }}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm">İptal</button>
              <button type="submit"
                className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium">Kaydet</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Cihaz Ekle Modal */}
      {showDevModal && (
        <Modal title="Cihaz Ekle" onClose={() => { setShowDevModal(false); setDevError('') }}>
          <form onSubmit={handleAddDevice} className="space-y-4">
            {/* Otomatik ID önizleme */}
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-xl">
              <span className="text-xs text-blue-500 font-medium">Otomatik ID:</span>
              <span className="font-mono text-sm font-bold text-blue-700">{peekNextDeviceId()}</span>
            </div>

            {/* Tag Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tag Name</label>
              <input
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Örn: Kazan Sıcaklık Sensörü"
                value={devForm.tagName}
                onChange={(e) => setDevForm({ ...devForm, tagName: e.target.value })}
                required
              />
            </div>

            {/* Birim Fiyat */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Birim Fiyat (₺/ay)</label>
              <input
                type="number" min="0" step="0.01"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={devForm.unitPrice || 0}
                onChange={(e) => setDevForm({ ...devForm, unitPrice: parseFloat(e.target.value) || 0 })}
              />
            </div>

            {/* Cihaz Tipi */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cihaz Tipi</label>
              <select
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={devForm.deviceType}
                onChange={(e) => setDevForm({ ...devForm, deviceType: e.target.value, subtype: '', unit: '' })}
                required
              >
                <option value="">Seçiniz</option>
                {DEVICE_TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Alt Tip — cihaz tipi seçilince görünür */}
            {devForm.deviceType && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {devForm.deviceType === 'plc' ? 'Model / Seri' : 'Sensör Tipi'}
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={devForm.subtype}
                  onChange={(e) => {
                    const unit = getUnit(devForm.deviceType, e.target.value)
                    const modbusConfig = devForm.deviceType === 'plc' ? { ...DEFAULT_MODBUS_CONFIG } : null
                    const plcIoConfig = devForm.deviceType === 'plc' ? { ...DEFAULT_PLC_IO_CONFIG_V2 } : null
                    setDevForm({ ...devForm, subtype: e.target.value, unit, modbusConfig, plcIoConfig })
                  }}
                  required
                >
                  <option value="">Seçiniz</option>
                  {getSubtypes(devForm.deviceType).map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Birim — otomatik atanır */}
            {devForm.unit && (
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-xl">
                <span className="text-xs text-green-600 font-medium">Otomatik Birim:</span>
                <span className="font-mono text-sm font-bold text-green-700">{devForm.unit}</span>
              </div>
            )}

            {/* ESP32 Seç — cihaz tipi seçilince görünür */}
            {devForm.deviceType && (
              <div className="border border-indigo-100 rounded-xl p-4 bg-indigo-50/30">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  🔗 Bağlı ESP32 Seç{' '}
                  <span className="text-xs text-gray-400 font-normal">(opsiyonel)</span>
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={devForm.selectedEsp32Id ?? ''}
                  onChange={(e) => setDevForm({ ...devForm, selectedEsp32Id: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">— Seçme (bağlantısız ekle) —</option>
                  {esp32Devices
                    .filter(d => d.status === 'connected' && !d.device_id)
                    .map(d => (
                      <option key={d.id} value={d.id}>
                        {d.esp32_tag} — {d.model}
                      </option>
                    ))
                  }
                </select>
                {esp32Devices.filter(d => d.status === 'connected' && !d.device_id).length === 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    {esp32Devices.filter(d => d.status === 'connected').length > 0
                      ? 'Tüm bağlı ESP32 cihazları başka cihazlara atanmış'
                      : 'Şu an bağlı ESP32 cihazı yok'}
                  </p>
                )}
              </div>
            )}

            {/* Modbus Yapılandırma — sadece PLC seçilince */}
            {devForm.deviceType === 'plc' && devForm.subtype && devForm.modbusConfig && (
              <div className="border border-blue-100 rounded-xl p-4 space-y-3 bg-blue-50/40">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Modbus Yapılandırma</p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Slave ID</label>
                    <input type="number" min={1} max={247}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      value={devForm.modbusConfig.slaveId}
                      onChange={(e) => setDevForm({ ...devForm, modbusConfig: { ...devForm.modbusConfig, slaveId: Number(e.target.value) } })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Baud Rate</label>
                    <select className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      value={devForm.modbusConfig.baudRate}
                      onChange={(e) => setDevForm({ ...devForm, modbusConfig: { ...devForm.modbusConfig, baudRate: Number(e.target.value) } })}>
                      {MODBUS_OPTIONS.baudRate.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Data Biti</label>
                    <select className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      value={devForm.modbusConfig.dataBits}
                      onChange={(e) => setDevForm({ ...devForm, modbusConfig: { ...devForm.modbusConfig, dataBits: Number(e.target.value) } })}>
                      {MODBUS_OPTIONS.dataBits.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Stop Biti</label>
                    <select className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      value={devForm.modbusConfig.stopBits}
                      onChange={(e) => setDevForm({ ...devForm, modbusConfig: { ...devForm.modbusConfig, stopBits: Number(e.target.value) } })}>
                      {MODBUS_OPTIONS.stopBits.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Parity</label>
                    <select className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      value={devForm.modbusConfig.parity}
                      onChange={(e) => setDevForm({ ...devForm, modbusConfig: { ...devForm.modbusConfig, parity: e.target.value } })}>
                      {MODBUS_OPTIONS.parity.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* PLC I/O Yapılandırma */}
            {devForm.deviceType === 'plc' && devForm.subtype && (
              <PlcIoConfigForm
                value={devForm.plcIoConfig ?? DEFAULT_PLC_IO_CONFIG_V2}
                onChange={(v) => setDevForm({ ...devForm, plcIoConfig: v })}
              />
            )}

            {devError && <p className="text-red-500 text-sm">{devError}</p>}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => { setShowDevModal(false); setDevError('') }}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm">İptal</button>
              <button type="submit"
                className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium">Ekle</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Cihaz Pasife Alma Onay Dialogu */}
      {toggleTarget && (
        <ConfirmDialog
          title="Cihazı Pasife Al"
          message={`"${toggleTarget.device.tagName}" (${toggleTarget.device.id}) cihazını pasife almak istediğinize emin misiniz? Pasif durumdayken bu cihaza veri gönderilemez.`}
          onConfirm={() => {
            toggleDeviceStatus(company.id, toggleTarget.locId, toggleTarget.device.id)
            setToggleTarget(null)
          }}
          onCancel={() => setToggleTarget(null)}
        />
      )}

      {/* Cihaz Silme Onay Dialogu */}
      {deleteDevTarget && (
        <ConfirmDialog
          title="Cihazı Sil"
          message={`"${deleteDevTarget.device.tagName}" (${deleteDevTarget.device.id}) cihazını ve tüm geçmiş verilerini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`}
          requirePassword
          onPasswordVerify={(pw) => pw === 'admin123'}
          onConfirm={() => {
            deleteDevice(company.id, deleteDevTarget.locId, deleteDevTarget.device.id)
            setDeleteDevTarget(null)
          }}
          onCancel={() => setDeleteDevTarget(null)}
        />
      )}

      {/* Lokasyon Silme Onay Dialogu */}
      {deleteLocTarget && (
        <ConfirmDialog
          title="Lokasyonu Sil"
          message={`"${deleteLocTarget.name}" lokasyonunu ve tüm cihazlarını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`}
          requirePassword
          onPasswordVerify={(pw) => pw === 'admin123'}
          onConfirm={() => {
            deleteLocation(company.id, deleteLocTarget.id)
            setDeleteLocTarget(null)
          }}
          onCancel={() => setDeleteLocTarget(null)}
        />
      )}
    </AppLayout>
  )
}
