import { describe, it, expect } from 'vitest'
import { renderHook } from './hookTestHelper.js'
import { useSearch } from '../../hooks/useSearch.js'

// Basit renderHook yardımcısı olmadan, useMemo'yu doğrudan test etmek için
// hook'un iç mantığını saf fonksiyon olarak test ediyoruz.
// useSearch useMemo kullanıyor, bu yüzden filtreleme mantığını doğrudan test edebiliriz.

const sampleItems = [
  { id: 1, name: 'Sıcaklık Sensörü', deviceId: 'DEV-001', company: 'Acme Corp' },
  { id: 2, name: 'Basınç Sensörü', deviceId: 'DEV-002', company: 'Beta Ltd' },
  { id: 3, name: 'Nem Ölçer', deviceId: 'DEV-003', company: 'Acme Corp' },
  { id: 4, name: 'PLC Delta', deviceId: 'DEV-004', company: 'Gamma AŞ' },
  { id: 5, name: 'Akış Sensörü', deviceId: 'DEV-005', company: 'Beta Ltd' },
]

const searchFields = ['name', 'deviceId', 'company']

describe('useSearch hook', () => {
  it('boş query tüm kayıtları döndürür', () => {
    const { result } = renderHook(() => useSearch(sampleItems, searchFields, ''))
    expect(result).toHaveLength(5)
  })

  it('null query tüm kayıtları döndürür', () => {
    const { result } = renderHook(() => useSearch(sampleItems, searchFields, null))
    expect(result).toHaveLength(5)
  })

  it('undefined query tüm kayıtları döndürür', () => {
    const { result } = renderHook(() => useSearch(sampleItems, searchFields, undefined))
    expect(result).toHaveLength(5)
  })

  it('sadece boşluk içeren query tüm kayıtları döndürür', () => {
    const { result } = renderHook(() => useSearch(sampleItems, searchFields, '   '))
    expect(result).toHaveLength(5)
  })

  it('isim alanında case-insensitive arama yapar', () => {
    const { result } = renderHook(() => useSearch(sampleItems, searchFields, 'sıcaklık'))
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(1)
  })

  it('büyük harfle arama case-insensitive çalışır', () => {
    const { result } = renderHook(() => useSearch(sampleItems, searchFields, 'SENSÖR'))
    expect(result).toHaveLength(3) // Sıcaklık, Basınç, Akış
  })

  it('deviceId alanında arama yapar', () => {
    const { result } = renderHook(() => useSearch(sampleItems, searchFields, 'DEV-003'))
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Nem Ölçer')
  })

  it('firma adında arama yapar', () => {
    const { result } = renderHook(() => useSearch(sampleItems, searchFields, 'acme'))
    expect(result).toHaveLength(2)
  })

  it('eşleşme yoksa boş dizi döner', () => {
    const { result } = renderHook(() => useSearch(sampleItems, searchFields, 'xyz123'))
    expect(result).toHaveLength(0)
  })

  it('kısmi metin eşleşmesi çalışır', () => {
    const { result } = renderHook(() => useSearch(sampleItems, searchFields, 'DEV-00'))
    expect(result).toHaveLength(5)
  })

  it('boş items dizisi ile çalışır', () => {
    const { result } = renderHook(() => useSearch([], searchFields, 'test'))
    expect(result).toHaveLength(0)
  })

  it('null değerli alanları güvenle atlar', () => {
    const itemsWithNull = [
      { id: 1, name: null, deviceId: 'DEV-001', company: 'Test' },
      { id: 2, name: 'Sensör', deviceId: null, company: null },
    ]
    const { result } = renderHook(() => useSearch(itemsWithNull, searchFields, 'test'))
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(1)
  })
})
