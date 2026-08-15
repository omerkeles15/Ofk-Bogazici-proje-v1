import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import Modal from './Modal'

export default function ConfirmDialog({
  title = 'Onay',
  message,
  onConfirm,
  onCancel,
  requirePassword = false,
  onPasswordVerify,
}) {
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    if (requirePassword) {
      if (!password.trim()) {
        setPasswordError('Şifre gerekli')
        return
      }

      setLoading(true)
      setPasswordError('')

      try {
        const isValid = await Promise.resolve(onPasswordVerify?.(password))
        if (!isValid) {
          setPasswordError('Şifre hatalı')
          setLoading(false)
          return
        }
      } catch {
        setPasswordError('Şifre hatalı')
        setLoading(false)
        return
      }

      setLoading(false)
    }

    onConfirm?.()
  }

  return (
    <Modal title={title} onClose={onCancel}>
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <AlertTriangle size={20} className="text-red-600" />
          </div>
          <p className="text-sm text-gray-700 pt-2">{message}</p>
        </div>

        {requirePassword && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Admin Şifresi
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (passwordError) setPasswordError('')
              }}
              placeholder="Şifrenizi girin"
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                passwordError ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {passwordError && (
              <p className="mt-1 text-xs text-red-600">{passwordError}</p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            İptal
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? 'Doğrulanıyor...' : 'Onayla'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
