import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Eye, Trash2, Pencil, AlertTriangle } from 'lucide-react'
import AppLayout from '../../components/Layout/AppLayout'
import Table from '../../components/Table'
import Modal from '../../components/Modal'
import FormField from '../../components/FormField'
import { useFormValidation } from '../../hooks/useFormValidation'
import { useCompanyStore } from '../../features/company/companyStore'
import { adminMenu } from './adminMenu'

export default function AdminCompanies() {
  const { companies, addCompany, updateCompany, deleteCompany } = useCompanyStore()
  const [showAddModal, setShowAddModal] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [form, setForm] = useState({ displayName: '', fullName: '' })
  const navigate = useNavigate()

  const validationRules = useMemo(() => ({
    displayName: (v) => (!v || !v.trim()) ? 'Görünen ad boş bırakılamaz' : null,
    fullName: (v) => (!v || !v.trim()) ? 'Tam ad boş bırakılamaz' : null,
  }), [])
  const { errors, validate, clearErrors } = useFormValidation(validationRules)

  const openAdd = () => { setForm({ displayName: '', fullName: '' }); clearErrors(); setShowAddModal(true) }
  const openEdit = (c) => { setForm({ displayName: c.displayName, fullName: c.fullName }); clearErrors(); setEditTarget(c) }

  const handleAdd = (e) => {
    e.preventDefault()
    if (!validate(form)) return
    addCompany(form); setShowAddModal(false)
  }

  const handleEdit = (e) => {
    e.preventDefault()
    if (!validate(form)) return
    updateCompany(editTarget.id, form); setEditTarget(null)
  }

  const columns = [
    { key: 'displayName', label: 'Görünen Ad' },
    { key: 'fullName', label: 'Tam Ad' },
    { key: 'locations', label: 'Lokasyon', render: (row) => <span className="text-gray-500">{row.locations.length}</span> },
    { key: 'devices', label: 'Cihaz', render: (row) => <span className="text-gray-500">{row.locations.flatMap((l) => l.devices).length}</span> },
    { key: 'actions', label: '', render: (row) => (
      <div className="flex items-center gap-1">
        <button onClick={() => navigate(`/admin/companies/${row.id}`)} className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600" title="Görüntüle"><Eye size={15} /></button>
        <button onClick={() => openEdit(row)} className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-500" title="Düzenle"><Pencil size={15} /></button>
        <button onClick={() => { setDeleteTarget(row); setDeletePassword(''); setDeleteError('') }} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500" title="Sil"><Trash2 size={15} /></button>
      </div>
    )},
  ]

  // Form alanları — inline JSX, bileşen değil (focus kaybını önler)
  const formFields = (
    <>
      <FormField label="Görünen Ad" error={errors.displayName} required>
        <input className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Acme Enerji" value={form.displayName}
          onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
      </FormField>
      <FormField label="Tam Ad" error={errors.fullName} required>
        <input className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Acme Enerji Sanayi A.Ş." value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
      </FormField>
    </>
  )

  return (
    <AppLayout menuItems={adminMenu}>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Firmalar</h1>
            <p className="text-gray-500 text-sm">{companies.length} firma kayıtlı</p>
          </div>
          <button onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium">
            <Plus size={16} /> Firma Ekle
          </button>
        </div>
        <Table columns={columns} data={companies} emptyText="Henüz firma eklenmemiş" />
      </div>

      {showAddModal && (
        <Modal title="Yeni Firma Ekle" onClose={() => setShowAddModal(false)}>
          <form onSubmit={handleAdd} className="space-y-4">
            {formFields}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 py-2 rounded-xl border border-gray-200 text-sm">İptal</button>
              <button type="submit" className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium">Ekle</button>
            </div>
          </form>
        </Modal>
      )}

      {editTarget && (
        <Modal title={`Düzenle — ${editTarget.displayName}`} onClose={() => setEditTarget(null)}>
          <form onSubmit={handleEdit} className="space-y-4">
            {formFields}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setEditTarget(null)} className="flex-1 py-2 rounded-xl border border-gray-200 text-sm">İptal</button>
              <button type="submit" className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium">Kaydet</button>
            </div>
          </form>
        </Modal>
      )}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-red-100 rounded-xl shrink-0">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Firmayı Sil</h3>
                <p className="text-sm text-gray-500 mt-1">
                  <strong>{deleteTarget.displayName}</strong> firması ve tüm lokasyonları, cihazları ile geçmiş verileri kalıcı olarak silinecek. Bu işlem geri alınamaz.
                </p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Admin şifresini girin</label>
              <input
                type="password"
                autoFocus
                placeholder="••••••••"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
              />
            </div>
            {deleteError && <p className="text-red-500 text-sm">{deleteError}</p>}
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={() => {
                  if (deletePassword !== 'admin123') {
                    setDeleteError('Şifre hatalı')
                    return
                  }
                  deleteCompany(deleteTarget.id)
                  setDeleteTarget(null)
                }}
                className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium"
              >
                Evet, Sil
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
