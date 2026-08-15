import Modal from '../../components/Modal'

const AP_STEPS = [
  "ESP32'yi açın",
  '"ESP32-Setup" Wi-Fi ağına bağlanın',
  'Tarayıcıda 192.168.4.1 adresine gidin',
  'Wi-Fi ağınızı seçin',
  'Wi-Fi şifrenizi girin',
  'Merkezi Server URL\'sini girin (örn: http://192.168.1.100:8000)',
  'ESP32 Tag bilgisini girin',
  'Kaydet butonuna basın',
  'ESP32 otomatik olarak sunucuya bağlanacaktır',
]

const REGISTER_EXAMPLE = `POST /api/esp32/register
{
  "esp32_tag": "Fabrika-ESP32-01",
  "device_type": "plc",
  "model": "ESP32-WROOM-32",
  "mac_address": "AA:BB:CC:DD:EE:FF",
  "firmware_version": "1.0.0"
}`

const HEARTBEAT_EXAMPLE = `POST /api/esp32/heartbeat
{
  "esp32_id": 1,
  "ip_address": "192.168.1.42",
  "firmware_version": "1.0.0"
}`

export default function ConnectionGuideModal({ isOpen, onClose }) {
  if (!isOpen) return null

  return (
    <Modal title="ESP32 Bağlantı Rehberi" onClose={onClose}>
      <div className="space-y-6 text-sm text-gray-700">

        {/* Bölüm 1: AP Mode Adımları */}
        <div>
          <h3 className="font-semibold text-gray-900 mb-3">AP Mode Bağlantı Adımları</h3>
          <ol className="space-y-2 list-decimal list-inside">
            {AP_STEPS.map((step, i) => (
              <li key={i} className="text-gray-700 leading-relaxed">
                {step}
              </li>
            ))}
          </ol>
        </div>

        {/* Bölüm 2: Register API */}
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Register API</h3>
          <pre className="bg-gray-50 rounded-lg p-3 text-xs overflow-x-auto text-gray-700 leading-relaxed">
            {REGISTER_EXAMPLE}
          </pre>
        </div>

        {/* Bölüm 3: Heartbeat API */}
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Heartbeat API</h3>
          <pre className="bg-gray-50 rounded-lg p-3 text-xs overflow-x-auto text-gray-700 leading-relaxed">
            {HEARTBEAT_EXAMPLE}
          </pre>
        </div>

      </div>
    </Modal>
  )
}
