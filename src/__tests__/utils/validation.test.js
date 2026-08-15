import { describe, it, expect } from 'vitest'
import { renderHook } from './hookTestHelper.js'
import { useFormValidation } from '../../hooks/useFormValidation.js'

describe('useFormValidation hook', () => {
  const rules = {
    displayName: (v) => (!v || !v.trim() ? 'Görünen ad zorunludur' : null),
    fullName: (v) => (!v || !v.trim() ? 'Tam ad zorunludur' : null),
  }

  it('başlangıçta errors boş ve isValid true olmalı', () => {
    const { result } = renderHook(() => useFormValidation(rules))
    expect(result.errors).toEqual({})
    expect(result.isValid).toBe(true)
  })

  it('geçerli veri ile validate true döner ve errors boş kalır', () => {
    let hookResult
    const container = document.createElement('div')
    const { createRoot } = require('react-dom/client')
    const { flushSync } = require('react-dom')
    const React = require('react')

    function TestComponent() {
      hookResult = useFormValidation(rules)
      return null
    }

    const root = createRoot(container)
    flushSync(() => {
      root.render(React.createElement(TestComponent))
    })

    let valid
    flushSync(() => {
      valid = hookResult.validate({ displayName: 'Acme', fullName: 'Acme Corp Ltd' })
    })

    // Re-render to get updated state
    flushSync(() => {
      root.render(React.createElement(TestComponent))
    })

    expect(valid).toBe(true)
    expect(hookResult.errors).toEqual({})
    expect(hookResult.isValid).toBe(true)
  })

  it('boş alanlar ile validate false döner ve hata mesajları oluşur', () => {
    let hookResult
    const container = document.createElement('div')
    const { createRoot } = require('react-dom/client')
    const { flushSync } = require('react-dom')
    const React = require('react')

    function TestComponent() {
      hookResult = useFormValidation(rules)
      return null
    }

    const root = createRoot(container)
    flushSync(() => {
      root.render(React.createElement(TestComponent))
    })

    let valid
    flushSync(() => {
      valid = hookResult.validate({ displayName: '', fullName: '' })
    })

    flushSync(() => {
      root.render(React.createElement(TestComponent))
    })

    expect(valid).toBe(false)
    expect(hookResult.errors.displayName).toBe('Görünen ad zorunludur')
    expect(hookResult.errors.fullName).toBe('Tam ad zorunludur')
    expect(hookResult.isValid).toBe(false)
  })

  it('sadece whitespace ile validate false döner', () => {
    let hookResult
    const container = document.createElement('div')
    const { createRoot } = require('react-dom/client')
    const { flushSync } = require('react-dom')
    const React = require('react')

    function TestComponent() {
      hookResult = useFormValidation(rules)
      return null
    }

    const root = createRoot(container)
    flushSync(() => {
      root.render(React.createElement(TestComponent))
    })

    let valid
    flushSync(() => {
      valid = hookResult.validate({ displayName: '   ', fullName: '  ' })
    })

    flushSync(() => {
      root.render(React.createElement(TestComponent))
    })

    expect(valid).toBe(false)
    expect(hookResult.errors.displayName).toBe('Görünen ad zorunludur')
    expect(hookResult.isValid).toBe(false)
  })

  it('clearErrors tüm hataları temizler ve isValid true olur', () => {
    let hookResult
    const container = document.createElement('div')
    const { createRoot } = require('react-dom/client')
    const { flushSync } = require('react-dom')
    const React = require('react')

    function TestComponent() {
      hookResult = useFormValidation(rules)
      return null
    }

    const root = createRoot(container)
    flushSync(() => {
      root.render(React.createElement(TestComponent))
    })

    // Önce hata oluştur
    flushSync(() => {
      hookResult.validate({ displayName: '', fullName: '' })
    })
    flushSync(() => {
      root.render(React.createElement(TestComponent))
    })
    expect(hookResult.isValid).toBe(false)

    // Sonra temizle
    flushSync(() => {
      hookResult.clearErrors()
    })
    flushSync(() => {
      root.render(React.createElement(TestComponent))
    })

    expect(hookResult.errors).toEqual({})
    expect(hookResult.isValid).toBe(true)
  })

  it('kısmi geçersiz veri ile sadece hatalı alanlar errors içinde olur', () => {
    let hookResult
    const container = document.createElement('div')
    const { createRoot } = require('react-dom/client')
    const { flushSync } = require('react-dom')
    const React = require('react')

    function TestComponent() {
      hookResult = useFormValidation(rules)
      return null
    }

    const root = createRoot(container)
    flushSync(() => {
      root.render(React.createElement(TestComponent))
    })

    let valid
    flushSync(() => {
      valid = hookResult.validate({ displayName: 'Acme', fullName: '' })
    })
    flushSync(() => {
      root.render(React.createElement(TestComponent))
    })

    expect(valid).toBe(false)
    expect(hookResult.errors.displayName).toBeUndefined()
    expect(hookResult.errors.fullName).toBe('Tam ad zorunludur')
  })

  it('null/undefined değerler ile doğrulama çalışır', () => {
    let hookResult
    const container = document.createElement('div')
    const { createRoot } = require('react-dom/client')
    const { flushSync } = require('react-dom')
    const React = require('react')

    function TestComponent() {
      hookResult = useFormValidation(rules)
      return null
    }

    const root = createRoot(container)
    flushSync(() => {
      root.render(React.createElement(TestComponent))
    })

    let valid
    flushSync(() => {
      valid = hookResult.validate({ displayName: null, fullName: undefined })
    })
    flushSync(() => {
      root.render(React.createElement(TestComponent))
    })

    expect(valid).toBe(false)
    expect(hookResult.errors.displayName).toBe('Görünen ad zorunludur')
    expect(hookResult.errors.fullName).toBe('Tam ad zorunludur')
  })
})
