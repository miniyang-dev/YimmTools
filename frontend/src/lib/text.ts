/** JSON helpers: error location, key sorting. */

export interface JsonFailure {
  message: string
  position?: number
  line?: number
  column?: number
}

export function locate(text: string, pos: number): { line: number; column: number } {
  const before = text.slice(0, pos)
  const line = before.split('\n').length
  const column = pos - (before.lastIndexOf('\n') + 1) + 1
  return { line, column }
}

/** Index of the first syntax error in `s`, or -1 when it is valid JSON. Engines differ in what their messages say, so we find it ourselves. */
export function jsonErrorIndex(s: string): number {
  let i = 0
  const fail = (): never => {
    throw i
  }
  const ws = () => {
    while (i < s.length && ' \t\n\r'.includes(s[i])) i++
  }
  const str = () => {
    i++
    while (i < s.length) {
      const c = s[i]
      if (c === '"') {
        i++
        return
      }
      if (c === '\\') {
        i++
        const e = s[i]
        if (e !== undefined && '"\\/bfnrt'.includes(e)) i++
        else if (e === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(s.slice(i + 1, i + 5))) fail()
          i += 5
        } else fail()
      } else if (c < ' ') fail()
      else i++
    }
    fail()
  }
  const num = () => {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(s.slice(i))
    if (!m) fail()
    i += m![0].length
  }
  const value = (): void => {
    ws()
    const c = s[i]
    if (c === '{') {
      i++
      ws()
      if (s[i] === '}') {
        i++
        return
      }
      for (;;) {
        ws()
        if (s[i] !== '"') fail()
        str()
        ws()
        if (s[i] !== ':') fail()
        i++
        value()
        ws()
        if (s[i] === ',') {
          i++
          continue
        }
        if (s[i] === '}') {
          i++
          return
        }
        fail()
      }
    }
    if (c === '[') {
      i++
      ws()
      if (s[i] === ']') {
        i++
        return
      }
      for (;;) {
        value()
        ws()
        if (s[i] === ',') {
          i++
          continue
        }
        if (s[i] === ']') {
          i++
          return
        }
        fail()
      }
    }
    if (c === '"') return str()
    if (c === '-' || (c >= '0' && c <= '9')) return num()
    for (const lit of ['true', 'false', 'null']) {
      if (s.startsWith(lit, i)) {
        i += lit.length
        return
      }
    }
    fail()
  }
  try {
    value()
    ws()
    return i < s.length ? i : -1
  } catch (e) {
    return typeof e === 'number' ? e : -1
  }
}

/**
 * Parsers stop at the token *after* a missing comma, so the reported line is often the wrong one.
 * If the error sits on a value or key that directly follows another value, the comma is missing
 * right after that previous value: return its end offset so the UI can point there instead.
 */
export function missingCommaAt(text: string, errorIndex: number): number | null {
  // the token the parser stopped on starts a value or a key
  if (!/^["{[\-\dtfn]/.test(text.slice(errorIndex, errorIndex + 1))) return null
  let j = errorIndex - 1
  while (j >= 0 && /\s/.test(text[j])) j--
  if (j < 0) return null
  // ...and the token before it ends a value: a quote, a closing bracket, a digit, or the end of true/false/null
  if (!/["}\]\deEl]/.test(text[j])) return null
  if (text[j] === '"') {
    // a string right after `{` or `,` is a key: then the colon is missing, not a comma
    let k = j - 1
    while (k >= 0 && !(text[k] === '"' && text[k - 1] !== '\\')) k--
    let before = k - 1
    while (before >= 0 && /\s/.test(text[before])) before--
    if (before >= 0 && (text[before] === '{' || text[before] === ',')) return null
  }
  return j + 1
}

export function parseJson(text: string): { ok: true; value: unknown } | ({ ok: false } & JsonFailure) {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    let position = jsonErrorIndex(text)
    if (position < 0) {
      const m = /position (\d+)/.exec(message)
      position = m ? Number(m[1]) : -1
    }
    if (position >= 0) return { ok: false, message, position, ...locate(text, position) }
    return { ok: false, message }
  }
}

export function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys)
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.keys(v as object)
        .sort()
        .map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]),
    )
  }
  return v
}

/** UTF-8-safe Base64. */
export function b64Encode(text: string, urlSafe = false): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  const out = btoa(bin)
  return urlSafe ? out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : out
}

export function b64Decode(text: string): string {
  const clean = text.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  const padded = clean + '='.repeat((4 - (clean.length % 4)) % 4)
  const bin = atob(padded)
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}
