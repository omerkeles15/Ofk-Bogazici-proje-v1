import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { X } from 'lucide-react'

export default function Sidebar({ menuItems, collapsed, mobileOpen, onClose }) {
  const [logoErr, setLogoErr] = useState(false)

  return (
    <aside
      className={`
        fixed lg:static inset-y-0 left-0 z-30
        flex flex-col bg-gray-900 text-white transition-all duration-300
        ${collapsed ? 'lg:w-16' : 'lg:w-60'}
        ${mobileOpen ? 'w-60 translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-gray-700">
        {!collapsed && (
          logoErr
            ? <span className="text-lg font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">SCADA UI</span>
            : <img src="/logo/logo.png" alt="Logo" className="h-14 object-contain" onError={() => setLogoErr(true)} />
        )}
        <button onClick={onClose} className="lg:hidden text-gray-400 hover:text-white">
          <X size={20} />
        </button>
      </div>

      {/* Menu */}
      <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 mx-2 rounded-xl transition-colors text-sm font-medium
              ${isActive
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            <span className="shrink-0">{item.icon}</span>
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
