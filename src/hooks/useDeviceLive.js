import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * WebSocket ile canlı cihaz verisi dinler.
 * Bağlantı koparsa otomatik yeniden bağlanır.
 * WebSocket yoksa polling'e fallback yapar.
 */
export function useDeviceLive(deviceId, onNewData) {
  const [connected, setConnected] = useState(false)
  const wsRef = useRef(null)
  const retryRef = useRef(null)

  const connect = useCallback(() => {
    if (!deviceId) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/ws/device/${deviceId}`

    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => setConnected(true)

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'new_data' && onNewData) {
            onNewData(data.record)
          }
        } catch { /* ignore parse errors */ }
      }

      ws.onclose = () => {
        setConnected(false)
        // 3 saniye sonra yeniden bağlan
        retryRef.current = setTimeout(connect, 3000)
      }

      ws.onerror = () => ws.close()
    } catch {
      setConnected(false)
      retryRef.current = setTimeout(connect, 3000)
    }
  }, [deviceId, onNewData])

  useEffect(() => {
    connect()
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current)
      if (wsRef.current) {
        wsRef.current.onclose = null // prevent reconnect on cleanup
        wsRef.current.close()
      }
    }
  }, [connect])

  return { connected }
}
