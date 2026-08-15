import { useNavigate } from 'react-router-dom'
import { ShieldOff } from 'lucide-react'

export default function Unauthorized() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-100 mb-4">
          <ShieldOff size={32} className="text-red-500" />
        </div>
        <h1 className="text-xl font-bold mb-2">Yetkisiz Erişim</h1>
        <p className="text-gray-500 text-sm mb-6">Bu sayfaya erişim yetkiniz bulunmuyor.</p>
        <button onClick={() => navigate(-1)}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium">
          Geri Dön
        </button>
      </div>
    </div>
  )
}
