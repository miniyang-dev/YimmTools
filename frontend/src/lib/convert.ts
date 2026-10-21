import Papa from 'papaparse'
import YAML from 'yaml'
import { parseJsonPrecise, stringifyValue } from './json-lossless'
import { jsonErrorIndex, locate, missingCommaAt } from './text'

export type Format = 'json' | 'yaml' | 'csv'

export interface ConvertOptions {
  indent: number
  csvHeader: boolean
  csvDelimiter: string
}

export const DEFAULT_OPTIONS: ConvertOptions = { indent: 2, csvHeader: true, csvDelimiter: ',' }

export type ConvertErrorKind = 'json' | 'yaml' | 'csv' | 'csv-shape'

/** A failure the UI can explain; `offset`/`line`/`column` point into the input when known. */
export class ConvertError extends Error {
  readonly line?: number
  readonly column?: number

  constructor(
    readonly kind: ConvertErrorKind,
    message: string,
    readonly offset?: number,
    text?: string,
  ) {
    super(message)
    if (offset !== undefined && text !== undefined) {
      const at = locate(text, offset)
      this.line = at.line
      this.column = at.column
    }
  }
}

/** First line of a parser message, without the trailing ":" that introduces the code excerpt. */
const firstLine = (e: unknown) => (e instanceof Error ? e.message : String(e)).split('\n')[0].replace(/:\s*$/, '')

/**
 * CSV cells are text. Only convert when the round trip is lossless, so
 * "00123", "0912345678", "1.50" and 20-digit ids stay exactly as written.
 */
export function inferCell(raw: string): string | number | boolean {
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (/^-?(0|[1-9]\d*)(\.\d+)?$/.test(raw)) {
    const n = Number(raw)
    if (String(n) === raw) return n
  }
  return raw
}

function parseCsv(text: string, o: ConvertOptions): unknown {
  // only trim the end: trimming the start would shift every reported line number
  const res = Papa.parse<string[] | Record<string, string>>(text.trimEnd(), {
    header: o.csvHeader,
    skipEmptyLines: 'greedy',
    dynamicTyping: false,
    delimiter: o.csvDelimiter === 'auto' ? '' : o.csvDelimiter,
  })
  const fatal = res.errors.find((e) => e.type !== 'FieldMismatch' && e.code !== 'UndetectableDelimiter')
  if (fatal) {
    // quote errors carry a character index; otherwise fall back to the start of the reported row
    const index = (fatal as { index?: number }).index
    const row = (fatal.row ?? 0) + (o.csvHeader ? 1 : 0)
    const offset = typeof index === 'number' ? index : lineStart(text, row + 1)
    throw new ConvertError('csv', fatal.message, offset, text)
  }
  return res.data.map((row) =>
    Array.isArray(row)
      ? row.map(inferCell)
      : Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === 'string' ? inferCell(v) : v])),
  )
}

/** Offset of the start of 1-based `line` (clamped to the end of the text). */
function lineStart(text: string, line: number): number {
  let offset = 0
  for (let i = 1; i < line; i++) {
    const next = text.indexOf('\n', offset)
    if (next < 0) return text.length
    offset = next + 1
  }
  return offset
}

function cell(v: unknown): unknown {
  if (v === null || v === undefined) return ''
  if (typeof v === 'bigint') return v.toString()
  if (typeof v === 'object') return stringifyValue(v, 0)
  return v
}

function toCsv(data: unknown, o: ConvertOptions): string {
  const rows = Array.isArray(data) ? data : [data]
  if (rows.length === 0) return ''
  const delimiter = o.csvDelimiter === 'auto' ? ',' : o.csvDelimiter
  if (rows.every((r) => Array.isArray(r))) {
    return Papa.unparse(
      (rows as unknown[][]).map((r) => r.map(cell)),
      { delimiter },
    )
  }
  if (!rows.every((r) => r && typeof r === 'object' && !Array.isArray(r)))
    throw new ConvertError('csv-shape', 'csv-shape')
  const keys: string[] = []
  for (const r of rows as Record<string, unknown>[]) for (const k of Object.keys(r)) if (!keys.includes(k)) keys.push(k)
  return Papa.unparse(
    { fields: keys, data: (rows as Record<string, unknown>[]).map((r) => keys.map((k) => cell(r[k]))) },
    { delimiter, header: o.csvHeader },
  )
}

function parseInput(input: string, from: Format, o: ConvertOptions): unknown {
  if (from === 'json') {
    try {
      JSON.parse(input) // validate with the engine first: its message is the one users recognise
    } catch (e) {
      const index = jsonErrorIndex(input)
      const offset = index < 0 ? undefined : (missingCommaAt(input, index) ?? index)
      throw new ConvertError('json', firstLine(e), offset, input)
    }
    return parseJsonPrecise(input)
  }
  if (from === 'yaml') {
    try {
      return YAML.parse(input, { intAsBigInt: true })
    } catch (e) {
      const pos = (e as { pos?: [number, number] }).pos
      throw new ConvertError('yaml', firstLine(e), pos?.[0], input)
    }
  }
  return parseCsv(input, o)
}

export function convert(input: string, from: Format, to: Format, o: ConvertOptions = DEFAULT_OPTIONS): string {
  if (!input.trim()) return ''
  const data = parseInput(input, from, o)
  if (to === 'json') return stringifyValue(data, o.indent)
  if (to === 'yaml') return YAML.stringify(data, { indent: o.indent, lineWidth: 0 })
  return toCsv(data, o)
}
