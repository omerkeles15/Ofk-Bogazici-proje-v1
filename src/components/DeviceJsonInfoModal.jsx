import { useState } from 'react'
import { HelpCircle, Copy, Check } from 'lucide-react'
import Modal from './Modal'
import { generateDeviceJsonTemplate, generateCompactFormatDescription } from '../features/device/generateJsonTemplate'

/**
 * Cihaz JSON veri formatı bilgi modalı.
 * Cihazın mevcut yapılandırmasına göre dinamik JSON şablonu üretir ve gösterir.
 * Kullanıcı JSON'u kopyalayabilir.
 *
 * @param {object} props
 * @param {object} props.device - Cihaz nesnesi (id, deviceType, subtype, plcIoConfig, modbusConfig vb.)
 * @param {object} props.company - Firma nesnesi (id, displayName)
 * @param {object} props.location - Lokasyon nesnesi (id, name)
 * @param {function} props.onClose - Modal kapatma fonksiyonu
 */
export default function DeviceJsonInfoModal({ device, company, location, onClose }) {
  const [copied, setCopied] = useState(false)

  const jsonTemplate = generateDeviceJsonTemplate(device, company, location)
  const jsonString = JSON.stringify(jsonTemplate, null, 2)
  const compactDesc = generateCompactFormatDescription(device)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonString)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: eski yöntem
      const textarea = document.createElement('textarea')
      textarea.value = jsonString
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const subtitle = device.deviceType === 'plc'
    ? `${(device.subtype ?? '').toUpperCase().replace('_', '-')} · ${location?.name ?? ''}`
    : `${device.unit ?? ''} · ${location?.name ?? ''}`

  return (
    <Modal
      title={`📋 Veri Gönderim Formatı — ${device.id}`}
      onClose={onClose}
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-500">{subtitle}</p>
        <p className="text-sm text-gray-600">
          Bu cihaza veri göndermek için aşağıdaki JSON formatını kullanın:
        </p>

        <div className="bg-gray-900 rounded-xl p-4 overflow-x-auto max-h-96 overflow-y-auto">
          <pre className="text-xs text-green-400 font-mono whitespace-pre">{jsonString}</pre>
        </div>

        {compactDesc && compactDesc.length > 0 && (
          <div className="bg-blue-50 rounded-xl p-3 space-y-1">
            <p className="text-xs font-semibold text-blue-700">Kompakt Format Açıklaması:</p>
            {compactDesc.map((line, i) => (
              <p key={i} className="text-xs text-blue-600">• {line}</p>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={handleCopy}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors
              ${copied
                ? 'bg-green-100 text-green-700'
                : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? 'Kopyalandı!' : "JSON'u Kopyala"}
          </button>
        </div>
      </div>
    </Modal>
  )
}
