/** Time helpers that respect an explicit IANA time zone (no dependency on the browser's zone). */

/** (wall-clock − UTC) of `tz` at the instant `utcMs`, in ms. */
export function zoneOffsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs))
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - Math.floor(utcMs / 1000) * 1000
}

/** Epoch ms of a wall-clock time in `tz` (DST-aware; a skipped hour resolves forward). */
export function wallTimeToEpoch(wall: number, tz: string): number {
  // `wall` = the wall-clock fields encoded as if they were UTC
  const first = wall - zoneOffsetMs(wall, tz)
  const second = wall - zoneOffsetMs(first, tz)
  // If `second` does not map back to the requested wall time we are inside a DST gap.
  return second + zoneOffsetMs(second, tz) === wall ? second : Math.max(first, second)
}

const WALL = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/
const WITH_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i

export interface ParsedTime {
  ms: number
  /** how a bare number was interpreted */
  unit: 'sec' | 'ms' | ''
}

/**
 * Accepts Unix seconds/milliseconds, ISO strings with an offset (`…Z`, `…+08:00`),
 * and bare dates/times (`2025-01-31`, `2025-01-31 08:00`) which are read in `tz`.
 */
export function parseTimeInput(input: string, tz: string): ParsedTime | null {
  const s = input.trim()
  if (!s) return null
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s)
    const isMs = Math.abs(n) >= 1e11
    return { ms: Math.round(isMs ? n : n * 1000), unit: isMs ? 'ms' : 'sec' }
  }
  const bad: ParsedTime = { ms: NaN, unit: '' }
  const m = WALL.exec(s)
  if (m) {
    const [y, mo, d, h, mi, sec] = m.slice(1, 7).map((v) => Number(v ?? 0))
    const msPart = m[7] ? Number(m[7].padEnd(3, '0')) : 0
    const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate()
    if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth || h > 23 || mi > 59 || sec > 59) return bad
    return { ms: wallTimeToEpoch(Date.UTC(y, mo - 1, d, h, mi, sec, msPart), tz), unit: '' }
  }
  if (WITH_OFFSET.test(s)) {
    const t = Date.parse(s.replace(' ', 'T'))
    return { ms: t, unit: '' }
  }
  return bad
}
