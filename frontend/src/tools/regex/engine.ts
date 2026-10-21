import { diffChars, diffLines, diffWords, diffWordsWithSpace, type Change } from 'diff'

export const MAX_MATCHES = 500

export type RegexResult =
  | { kind: 'error'; error: string }
  | { kind: 'ok'; matches: RegExpExecArray[]; truncated: boolean; replaced: string | null }

/** Run `pattern` over `subject`. Matching is always global; replacement uses the flags as given. */
export function runRegex(pattern: string, flags: string, subject: string, replacement: string): RegexResult | null {
  if (!pattern) return null
  let re: RegExp
  try {
    re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g')
  } catch (e) {
    return { kind: 'error', error: e instanceof Error ? e.message : String(e) }
  }
  const matches: RegExpExecArray[] = []
  let truncated = false
  for (const m of subject.matchAll(re)) {
    matches.push(m)
    if (matches.length >= MAX_MATCHES) {
      truncated = true
      break
    }
  }
  let replaced: string | null = null
  if (replacement) {
    try {
      replaced = subject.replace(new RegExp(pattern, flags), replacement)
    } catch {
      replaced = null
    }
  }
  return { kind: 'ok', matches, truncated, replaced }
}

export type DiffMode = 'lines' | 'words' | 'chars'

export interface DiffOptions {
  mode: DiffMode
  ignoreCase: boolean
  ignoreWhitespace: boolean
}

export interface DiffResult {
  parts: Change[]
  added: number
  removed: number
}

export function computeDiff(a: string, b: string, { mode, ignoreCase, ignoreWhitespace }: DiffOptions): DiffResult {
  let parts: Change[]
  if (mode === 'lines') parts = diffLines(a, b, { ignoreCase, ignoreWhitespace })
  else if (mode === 'words')
    parts = ignoreWhitespace ? diffWords(a, b, { ignoreCase }) : diffWordsWithSpace(a, b, { ignoreCase })
  else parts = diffChars(a, b, { ignoreCase })
  const total = (pick: (p: Change) => boolean) => parts.filter(pick).reduce((n, p) => n + (p.count ?? 0), 0)
  return { parts, added: total((p) => !!p.added), removed: total((p) => !!p.removed) }
}
