import { useCallback } from 'react'
import { translate, useLang } from '../i18n'
import type { ToolMeta } from '../tools/registry'

/** `text(tool, 'name')` / `text(tool, 'desc')` in the current language. */
export function useToolText() {
  const lang = useLang()
  return useCallback(
    (tool: Pick<ToolMeta, 'strings'>, field: 'name' | 'desc') => translate(tool.strings, lang, field),
    [lang],
  )
}
