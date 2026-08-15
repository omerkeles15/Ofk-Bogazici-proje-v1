import { useState, useMemo, useCallback } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight, Building2, MapPin } from 'lucide-react'
import AppLayout from '../../components/Layout/AppLayout'
import Modal from '../../components/Modal'
import SearchInput from '../../components/SearchInput'
import FormField from '../../components/FormField'
import { useUserStore } from '../../features/users/userStore'
import { useCompanyStore } from '../../features/company/companyStore'
import { useSearch } from '../../hooks/useSearch'
import { useFormValidation } from '../../hooks/useFormValidation'
import { adminMenu } from './adminMenu'

const ROLES = [
  { value: 'company_manager', label: 'Firma Yöneticisi' },
  { value: 'location_manager', label: 'Lokasyon Yöneticisi' },
  { value: 'user', label: 'Kullanıcı' },
]

const ROLE_META = {
  company_manager: { label: 'Firma Yöneticisi', color: 'bg-blue-100 text-blue-700' },
  location_manager: { label: 'Lokasyon Yöneticisi', color: 'bg-purple-100 text-purple-700' },
  user: { label: 'Kullanıcı', color: 'bg-gray-100 text-gray-600' },
  admin: { label: 'Admin', color: 'bg-red-100 text-red-700' },
}

function RoleBadge({ role }) {
  const meta = ROLE_META[role] ?? { label: role, color: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.color}`}>{meta.label}</span>
  )
}

function UserRow({ user, onDelete }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 rounded-xl transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-cyan-400 flex items-center justify-center text-white text-xs font-bold shrink-0">
          {user.name?.[0] ?? 'U'}
        </div>
        <div>
          <p className="text-sm font-medium text-gray-800">{user.name}</p>
          <p className="text-xs text-gray-400">@{user.username}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <RoleBadge role={user.role} />
        <button onClick={() => onDelete(user.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

// Firma ağaç kartı
function CompanyTree({ company, users, search, onDelete }) {
  const [open, setOpen] = useState(true)

  // Bu firmaya ait kullanıcılar
  const companyUsers = users.filter((u) => u.companyId === company.id)

  // Firma yöneticileri
  const firmaMgrs = companyUsers.filter((u) => u.role === 'company_manager')

  // Lokasyon bazlı kullanıcılar
  const byLocation = company.locations.map((loc) => ({
    loc,
    users: companyUsers.filter((u) => u.locationId === loc.id),
  }))

  // useSearch ile filtreleme (name, username, rolLabel alanlarında)
  const searchableCompanyUsers = useMemo(() =>
    companyUsers.map((u) => ({ ...u, rolLabel: ROLE_META[u.role]?.label || u.role })),
    [companyUsers]
  )
  const filteredCompanyUsers = useSearch(searchableCompanyUsers, ['name', 'username', 'rolLabel'], search)
  const filteredIds = useMemo(() => new Set(filteredCompanyUsers.map((u) => u.id)), [filteredCompanyUsers])

  const filteredFirmaMgrs = firmaMgrs.filter((u) => filteredIds.has(u.id))
  const filteredByLocation = byLocation.map((bl) => ({ ...bl, users: bl.users.filter((u) => filteredIds.has(u.id)) }))

  // Arama varsa ve bu firmada hiç eşleşme yoksa gizle
  const hasAnyMatch = filteredFirmaMgrs.length > 0 || filteredByLocation.some((bl) => bl.users.length > 0)
  if (search && !hasAnyMatch) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Firma başlığı */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
          <Building2 size={15} className="text-white" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-gray-900">{company.displayName}</p>
          <p className="text-xs text-gray-400">{company.fullName} · {companyUsers.length} kullanıcı</p>
        </div>
        {open ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-3">
          {/* Firma yöneticileri */}
          {filteredFirmaMgrs.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide px-1 mb-1">Firma Yöneticileri</p>
              {filteredFirmaMgrs.map((u) => <UserRow key={u.id} user={u} onDelete={onDelete} />)}
            </div>
          )}

          {/* Lokasyon bazlı */}
          {filteredByLocation.map(({ loc, users: locUsers }) => {
            if (locUsers.length === 0) return null
            return (
              <div key={loc.id}>
                <div className="flex items-center gap-1.5 px-1 mb-1">
                  <MapPin size={12} className="text-purple-400" />
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{loc.name}</p>
                </div>
                {locUsers.map((u) => <UserRow key={u.id} user={u} onDelete={onDelete} />)}
              </div>
            )
          })}

          {/* Firmaya bağlı ama lokasyonsuz kullanıcılar */}
          {(() => {
            const noLoc = companyUsers.filter(
              (u) => u.role !== 'company_manager' && !u.locationId
            ).filter((u) => filteredIds.has(u.id))
            if (noLoc.length === 0) return null
            return (
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide px-1 mb-1">Lokasyon Atanmamış</p>
                {noLoc.map((u) => <UserRow key={u.id} user={u} onDelete={onDelete} />)}
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

export default function AdminUsers() {
  const { users, addUser, deleteUser } = useUserStore()
  const { companies } = useCompanyStore()
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ username: '', name: '', password: '', role: 'user', companyId: '', locationId: '' })
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const validationRules = useMemo(() => ({
    name: (value) => (!value || !value.trim()) ? 'Ad soyad boş bırakılamaz' : null,
    username: (value) => {
      if (!value || !value.trim()) return 'Kullanıcı adı boş bırakılamaz'
      if (users.some((u) => u.username === value.trim())) return 'Bu kullanıcı adı zaten alınmış'
      return null
    },
    password: (value) => (!value || !value.trim()) ? 'Şifre boş bırakılamaz' : null,
  }), [users])

  const { errors: fieldErrors, validate, clearErrors } = useFormValidation(validationRules)

  const selectedCompany = companies.find((c) => c.id === Number(form.companyId))

  const openModal = useCallback(() => {
    setForm({ username: '', name: '', password: '', role: 'user', companyId: '', locationId: '' })
    setError('')
    clearErrors()
    setShowModal(true)
  }, [clearErrors])

  const handleAdd = async (e) => {
    e.preventDefault()
    setError('')
    if (!validate(form)) return
    try {
      await addUser({
        ...form,
        companyId: form.companyId ? Number(form.companyId) : null,
        locationId: form.locationId ? Number(form.locationId) : null,
      })
      setForm({ username: '', name: '', password: '', role: 'user', companyId: '', locationId: '' })
      setShowModal(false)
    } catch (err) {
      setError(err.response?.data?.detail || err.message)
    }
  }

  // Firmaya bağlı olmayan kullanıcılar
  const unassigned = useMemo(() =>
    users.filter((u) => !u.companyId && u.role !== 'admin'),
    [users])

  // useSearch ile firmaya atanmamış kullanıcıları filtrele
  const searchableUnassigned = useMemo(() =>
    unassigned.map((u) => ({ ...u, rolLabel: ROLE_META[u.role]?.label || u.role })),
    [unassigned]
  )
  const filteredUnassigned = useSearch(searchableUnassigned, ['name', 'username', 'rolLabel'], search)

  // Tüm kullanıcılarda arama sonucu kontrolü (boş sonuç mesajı için)
  const searchableAllUsers = useMemo(() =>
    users.filter((u) => u.role !== 'admin').map((u) => ({ ...u, rolLabel: ROLE_META[u.role]?.label || u.role })),
    [users]
  )
  const allFilteredUsers = useSearch(searchableAllUsers, ['name', 'username', 'rolLabel'], search)
  const noResults = search && allFilteredUsers.length === 0

  return (
    <AppLayout menuItems={adminMenu}>
      <div className="space-y-5">
        {/* Başlık */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Kullanıcılar</h1>
            <p className="text-gray-500 text-sm">{users.length} kullanıcı kayıtlı</p>
          </div>
          <button onClick={openModal}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium">
            <Plus size={16} /> Kullanıcı Ekle
          </button>
        </div>

        {/* Arama */}
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Ad, kullanıcı adı veya rol ara..."
        />

        {/* Firma ağaçları */}
        {companies.map((c) => (
          <CompanyTree key={c.id} company={c} users={users} search={search} onDelete={deleteUser} />
        ))}

        {/* Arama sonucu boşsa mesaj göster */}
        {noResults && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
            <p className="text-gray-400 text-sm">Kullanıcı bulunamadı</p>
          </div>
        )}

        {/* Firmaya bağlı olmayan kullanıcılar */}
        {filteredUnassigned.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Firma Atanmamış</p>
            {filteredUnassigned.map((u) => <UserRow key={u.id} user={u} onDelete={deleteUser} />)}
          </div>
        )}
      </div>

      {/* Kullanıcı Ekle Modal */}
      {showModal && (
        <Modal title="Yeni Kullanıcı" onClose={() => setShowModal(false)}>
          <form onSubmit={handleAdd} className="space-y-3">
            {[
              { label: 'Ad Soyad', key: 'name', placeholder: 'Ahmet Yılmaz' },
              { label: 'Kullanıcı Adı', key: 'username', placeholder: 'ahmet_yilmaz' },
              { label: 'Şifre', key: 'password', placeholder: '••••••••', type: 'password' },
            ].map(({ label, key, placeholder, type }) => (
              <FormField key={key} label={label} error={fieldErrors[key]} required>
                <input type={type ?? 'text'} placeholder={placeholder}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
              </FormField>
            ))}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
              <select className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Firma</label>
              <select className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value, locationId: '' })}>
                <option value="">Seçiniz</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}
              </select>
            </div>
            {selectedCompany && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lokasyon</label>
                <select className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
                  <option value="">Seçiniz</option>
                  {selectedCompany.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            )}
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowModal(false)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm">İptal</button>
              <button type="submit"
                className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium">Ekle</button>
            </div>
          </form>
        </Modal>
      )}
    </AppLayout>
  )
}
