import { Search, X } from 'lucide-react'

export default function SearchInput({ value, onChange, placeholder = 'Ara...', onClear }) {
  return (
    <div className="relative">
      <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-10 pr-10 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      {value && (
        <button
          onClick={() => onClear?.() ?? onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
        >
          <X size={16} />
        </button>
      )}
    </div>
  )
}
