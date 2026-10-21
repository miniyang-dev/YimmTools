/**
 * Precision-preserving JSON helpers.
 *
 * `JSON.parse` silently rounds big integers (12345678901234567890 -> …567000),
 * turns 1e400 into Infinity, and reorders integer-like keys. A formatter must
 * not change data, so we keep every literal exactly as the user wrote it.
 * Callers must pass syntactically valid JSON (see `jsonErrorIndex`).
 */

export type JsonNode =
  | { t: 'obj'; entries: [string, JsonNode][] } // key is the raw (quoted) literal
  | { t: 'arr'; items: JsonNode[] }
  | { t: 'lit'; raw: string } // string, number, true, false, null

const WS = ' \t\n\r'
const NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/

export function parseLossless(text: string): JsonNode {
  let i = 0
  const ws = () => {
    while (i < text.length && WS.includes(text[i])) i++
  }
  const string = (): string => {
    const start = i
    i++
    while (text[i] !== '"') i += text[i] === '\\' ? 2 : 1
    i++
    return text.slice(start, i)
  }
  const value = (): JsonNode => {
    ws()
    const c = text[i]
    if (c === '{') {
      i++
      const entries: [string, JsonNode][] = []
      ws()
      if (text[i] === '}') {
        i++
        return { t: 'obj', entries }
      }
      for (;;) {
        ws()
        const key = string()
        ws()
        i++ // :
        entries.push([key, value()])
        ws()
        if (text[i++] === '}') return { t: 'obj', entries }
      }
    }
    if (c === '[') {
      i++
      const items: JsonNode[] = []
      ws()
      if (text[i] === ']') {
        i++
        return { t: 'arr', items }
      }
      for (;;) {
        items.push(value())
        ws()
        if (text[i++] === ']') return { t: 'arr', items }
      }
    }
    if (c === '"') return { t: 'lit', raw: string() }
    const m = NUMBER.exec(text.slice(i))
    if (m) {
      i += m[0].length
      return { t: 'lit', raw: m[0] }
    }
    const word = /^(true|false|null)/.exec(text.slice(i))![0]
    i += word.length
    return { t: 'lit', raw: word }
  }
  return value()
}

export interface FormatOptions {
  /** '' = minified */
  indent: string
  sortKeys: boolean
}

export function formatJson(text: string, { indent, sortKeys }: FormatOptions): string {
  const root = parseLossless(text)
  const nl = (depth: number) => (indent ? '\n' + indent.repeat(depth) : '')
  const colon = indent ? ': ' : ':'
  const out = (n: JsonNode, depth: number): string => {
    if (n.t === 'lit') return n.raw
    if (n.t === 'arr') {
      if (!n.items.length) return '[]'
      return '[' + n.items.map((x) => nl(depth + 1) + out(x, depth + 1)).join(',') + nl(depth) + ']'
    }
    if (!n.entries.length) return '{}'
    const entries = sortKeys
      ? [...n.entries].sort((a, b) => {
          const ka = JSON.parse(a[0]) as string
          const kb = JSON.parse(b[0]) as string
          return ka < kb ? -1 : ka > kb ? 1 : 0
        })
      : n.entries
    return '{' + entries.map(([k, v]) => nl(depth + 1) + k + colon + out(v, depth + 1)).join(',') + nl(depth) + '}'
  }
  return out(root, 0)
}

/** Parse to plain values; integers outside the safe range become BigInt instead of being rounded. */
export function parseJsonPrecise(text: string): unknown {
  const conv = (n: JsonNode): unknown => {
    if (n.t === 'arr') return n.items.map(conv)
    if (n.t === 'obj') return Object.fromEntries(n.entries.map(([k, v]) => [JSON.parse(k) as string, conv(v)]))
    if (/^-?\d+$/.test(n.raw)) {
      const num = Number(n.raw)
      return Number.isSafeInteger(num) ? num : BigInt(n.raw)
    }
    return JSON.parse(n.raw)
  }
  return conv(parseLossless(text))
}

/** `JSON.stringify` that also understands BigInt. */
export function stringifyValue(value: unknown, indent: number | string = 2): string {
  const pad = typeof indent === 'number' ? ' '.repeat(indent) : indent
  const walk = (v: unknown, depth: number): string => {
    if (typeof v === 'bigint') return v.toString()
    if (Array.isArray(v)) {
      if (!v.length) return '[]'
      const nl = pad ? '\n' + pad.repeat(depth + 1) : ''
      return '[' + v.map((x) => nl + walk(x, depth + 1)).join(',') + (pad ? '\n' + pad.repeat(depth) : '') + ']'
    }
    if (v && typeof v === 'object') {
      const e = Object.entries(v as Record<string, unknown>)
      if (!e.length) return '{}'
      const nl = pad ? '\n' + pad.repeat(depth + 1) : ''
      return (
        '{' +
        e.map(([k, x]) => nl + JSON.stringify(k) + (pad ? ': ' : ':') + walk(x, depth + 1)).join(',') +
        (pad ? '\n' + pad.repeat(depth) : '') +
        '}'
      )
    }
    return JSON.stringify(v) ?? 'null'
  }
  return walk(value, 0)
}
