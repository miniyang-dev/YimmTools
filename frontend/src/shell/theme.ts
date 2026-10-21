import { useCallback, useEffect, useState } from 'react'

export type Theme = 'system' | 'light' | 'dark'
const KEY = 'yimm-theme'
const ORDER: Theme[] = ['system', 'light', 'dark']

function read(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {
    /* ignore */
  }
  return 'system'
}

function apply(theme: Theme) {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(read)
  useEffect(() => apply(theme), [theme])
  const cycle = useCallback(() => {
    setTheme((cur) => {
      const next = ORDER[(ORDER.indexOf(cur) + 1) % ORDER.length]
      try {
        if (next === 'system') localStorage.removeItem(KEY)
        else localStorage.setItem(KEY, next)
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])
  return { theme, cycle }
}
