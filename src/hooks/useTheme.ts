/**
 * useTheme — persists light/dark preference to localStorage,
 * applies data-theme="dark" on <html> for CSS variable switching.
 */
import { useState, useEffect } from 'react'

export type Theme = 'light' | 'dark'

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem('openpay-theme') as Theme) ?? 'light'
    } catch {
      return 'light'
    }
  })

  useEffect(() => {
    applyTheme(theme)
    try { localStorage.setItem('openpay-theme', theme) } catch { /* noop */ }
  }, [theme])

  // Apply on mount in case the value was persisted from a previous session
  useEffect(() => { applyTheme(theme) }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = () => setTheme(t => t === 'light' ? 'dark' : 'light')

  return { theme, setTheme, toggle, isDark: theme === 'dark' }
}
