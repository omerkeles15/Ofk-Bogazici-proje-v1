/**
 * Basit hook test yardımcısı — React hook'larını senkron olarak çalıştırır.
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

export function renderHook(hookFn) {
  let result

  function TestComponent() {
    result = hookFn()
    return null
  }

  const container = document.createElement('div')
  const root = createRoot(container)

  flushSync(() => {
    root.render(React.createElement(TestComponent))
  })

  return { result }
}
