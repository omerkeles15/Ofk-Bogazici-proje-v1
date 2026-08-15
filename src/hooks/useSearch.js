import { useMemo } from 'react'

/**
 * useSearch — Metin bazlı arama/filtreleme hook'u
 * @param {Array} items - Filtrelenecek dizi
 * @param {string[]} searchFields - Aranacak alan isimleri
 * @param {string} query - Arama metni
 * @returns {Array} Filtrelenmiş dizi (case-insensitive, anlık)
 */
export const useSearch = (items, searchFields, query) => {
  return useMemo(() => {
    if (!query || !query.trim()) return items

    const lowerQuery = query.toLowerCase().trim()

    return items.filter((item) =>
      searchFields.some((field) => {
        const value = item[field]
        if (value == null) return false
        return String(value).toLowerCase().includes(lowerQuery)
      })
    )
  }, [items, searchFields, query])
}
