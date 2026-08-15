import { useEffect, useState } from 'react'
import AppLayout from '../../components/Layout/AppLayout'
import { adminMenu } from './adminMenu'
import axios from 'axios'

export default function FinancePage() {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    axios.get('/api/finance/summary')
      .then(r => { setSummary(r.data); setLoading(false) })
      .catch(() => { setError('Veri yüklenemedi'); setLoading(false) })
  }, [])

  return (
    <AppLayout menuItems={adminMenu}>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold">Hesap Yönetimi</h1>
          <p className="text-gray-500 text-sm">Firma bazlı aktif cihaz ve fatura özeti</p>
        </div>

        {loading && <div className="text-center py-10 text-gray-400">Yükleniyor...</div>}
        {error && <div className="text-red-500">{error}</div>}

        {summary && (
          <>
            {/* Genel Özet */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <p className="text-xs text-gray-400 mb-1">Toplam Aylık Gelir</p>
                <p className="text-2xl font-bold text-green-600">₺{summary.grand_total.toLocaleString('tr-TR', {minimumFractionDigits: 2})}</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <p className="text-xs text-gray-400 mb-1">Toplam Firma</p>
                <p className="text-2xl font-bold text-gray-800">{summary.companies.length}</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <p className="text-xs text-gray-400 mb-1">Aktif Cihazlar</p>
                <p className="text-2xl font-bold text-blue-600">{summary.companies.reduce((s, c) => s + c.active_device_count, 0)}</p>
              </div>
            </div>

            {/* Firma Tablosu */}
            {summary.companies.map(company => (
              <div key={company.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
                  <div>
                    <h2 className="font-semibold text-gray-800">{company.name}</h2>
                    <p className="text-xs text-gray-400">{company.active_device_count} aktif cihaz</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Aylık Toplam</p>
                    <p className="font-bold text-green-600">₺{company.total.toLocaleString('tr-TR', {minimumFractionDigits: 2})}</p>
                  </div>
                </div>
                {company.locations.map(loc => (
                  <div key={loc.id} className="border-b border-gray-50 last:border-0">
                    <div className="flex items-center justify-between px-5 py-2 bg-gray-50/50">
                      <p className="text-sm font-medium text-gray-600">{loc.name}</p>
                      <p className="text-sm text-gray-500">₺{loc.subtotal.toLocaleString('tr-TR', {minimumFractionDigits: 2})}</p>
                    </div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-400 border-b border-gray-50">
                          <th className="text-left px-5 py-1.5 font-medium">Cihaz</th>
                          <th className="text-left px-5 py-1.5 font-medium">Tür</th>
                          <th className="text-left px-5 py-1.5 font-medium">Durum</th>
                          <th className="text-right px-5 py-1.5 font-medium">Birim Fiyat</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loc.devices.map(dev => (
                          <tr key={dev.id} className={`border-b border-gray-50 ${dev.billable ? '' : 'opacity-40'}`}>
                            <td className="px-5 py-2">{dev.tagName} <span className="text-gray-400">({dev.id})</span></td>
                            <td className="px-5 py-2 text-gray-500">{dev.deviceType ?? '—'}</td>
                            <td className="px-5 py-2">
                              <span className={`px-1.5 py-0.5 rounded-full ${dev.billable ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                {dev.billable ? 'Aktif' : 'Pasif'}
                              </span>
                            </td>
                            <td className="px-5 py-2 text-right">{dev.billable ? `₺${dev.unit_price.toLocaleString('tr-TR', {minimumFractionDigits: 2})}` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            ))}

            <p className="text-xs text-gray-400 text-right">Son güncelleme: {new Date(summary.generated_at).toLocaleString('tr-TR')}</p>
          </>
        )}
      </div>
    </AppLayout>
  )
}
