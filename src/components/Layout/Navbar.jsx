import { Menu, PanelLeftClose, PanelLeftOpen, LogOut, Bell } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useNavigate } from 'react-router-dom'

const ROLE_LABELS = {
  admin: 'Admin',
  company_manager: 'Firma Yöneticisi',
  location_manager: 'Lokasyon Yöneticisi',
  user: 'Kullanıcı',
}

export default function Navbar({ onMenuToggle, onCollapseToggle, collapsed }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-2">
        <button onClick={onMenuToggle} className="lg:hidden p-2 rounded-lg hover:bg-gray-100">
          <Menu size={20} />
        </button>
        <button onClick={onCollapseToggle} className="hidden lg:flex p-2 rounded-lg hover:bg-gray-100">
          {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button className="p-2 rounded-lg hover:bg-gray-100 relative">
          <Bell size={18} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>

        <div className="flex items-center gap-2 pl-3 border-l border-gray-200">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white text-sm font-bold">
            {user?.name?.[0] ?? 'U'}
          </div>
          <div className="hidden sm:block text-sm">
            <p className="font-medium leading-tight">{user?.name}</p>
            <p className="text-gray-500 text-xs">{ROLE_LABELS[user?.role]}</p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="p-2 rounded-lg hover:bg-red-50 hover:text-red-600 text-gray-500 transition-colors"
          title="Çıkış Yap"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  )
}
