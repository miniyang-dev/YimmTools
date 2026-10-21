import { createContext, useCallback, useContext } from 'react'
import common from './common.json'

export const LANGS = [
  { code: 'zh-TW', label: '繁體中文', short: '繁中' },
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'zh-CN', label: '简体中文', short: '简中' },
  { code: 'es', label: 'Español', short: 'ES' },
  { code: 'ja', label: '日本語', short: '日本語' },
] as const

export type Lang = (typeof LANGS)[number]['code']
export const DEFAULT_LANG: Lang = 'zh-TW'
export type Dict = Record<string, string>
export type Strings = Partial<Record<Lang, Dict>> & { 'zh-TW': Dict }

export function isLang(x: unknown): x is Lang {
  return LANGS.some((l) => l.code === x)
}

const STORE = 'yimm-lang'

export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORE)
    if (isLang(saved)) return saved
  } catch {
    /* storage unavailable */
  }
  for (const raw of navigator.languages ?? [navigator.language]) {
    const l = raw.toLowerCase()
    if (l.startsWith('zh')) return /tw|hk|mo|hant/.test(l) ? 'zh-TW' : 'zh-CN'
    if (l.startsWith('en')) return 'en'
    if (l.startsWith('es')) return 'es'
    if (l.startsWith('ja')) return 'ja'
  }
  return DEFAULT_LANG
}

export function rememberLang(lang: Lang): void {
  try {
    localStorage.setItem(STORE, lang)
  } catch {
    /* ignore */
  }
}

const LangCtx = createContext<Lang>(DEFAULT_LANG)
export const LangProvider = LangCtx.Provider
export const useLang = () => useContext(LangCtx)

export type Vars = Record<string, string | number>

export function translate(strings: Strings, lang: Lang, key: string, vars?: Vars): string {
  const chain: Lang[] = lang === 'zh-CN' ? ['zh-CN', 'zh-TW'] : lang === 'zh-TW' ? ['zh-TW'] : [lang, 'en', 'zh-TW']
  let text: string | undefined
  for (const l of chain) {
    text = strings[l]?.[key]
    if (text !== undefined) break
  }
  if (text === undefined) return key
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (_, name: string) => (name in vars ? String(vars[name]) : `{${name}}`))
}

export function useStrings(strings: Strings) {
  const lang = useLang()
  return useCallback((key: string, vars?: Vars) => translate(strings, lang, key, vars), [strings, lang])
}

export const commonStrings = common as unknown as Strings
export const useT = () => useStrings(commonStrings)
