export interface PasswordOptions {
  length: number
  lower: boolean
  upper: boolean
  digits: boolean
  symbols: boolean
  avoidAmbiguous: boolean
}

const SETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.?/~',
}
const AMBIGUOUS = /[O0oIl1|`'"]/g

/** Uniform integer in [0, max) from crypto randomness (rejection sampling, no modulo bias). */
export function randomInt(
  max: number,
  rng: (a: Uint32Array) => Uint32Array = (a) => crypto.getRandomValues(a),
): number {
  if (max <= 0 || max > 0x100000000) throw new RangeError('max out of range')
  const limit = Math.floor(0x100000000 / max) * max
  const buf = new Uint32Array(1)
  for (;;) {
    rng(buf)
    if (buf[0] < limit) return buf[0] % max
  }
}

export function activeSets(o: PasswordOptions): string[] {
  const keys = (['lower', 'upper', 'digits', 'symbols'] as const).filter((k) => o[k])
  return keys.map((k) => (o.avoidAmbiguous ? SETS[k].replace(AMBIGUOUS, '') : SETS[k]))
}

export function generatePassword(o: PasswordOptions): string {
  const sets = activeSets(o)
  if (sets.length === 0) return ''
  const length = Math.max(o.length, sets.length)
  const pool = sets.join('')
  const chars: string[] = sets.map((s) => s[randomInt(s.length)])
  while (chars.length < length) chars.push(pool[randomInt(pool.length)])
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

export function entropyBits(o: PasswordOptions): number {
  const pool = activeSets(o).join('').length
  return pool ? Math.log2(pool) * Math.max(o.length, activeSets(o).length) : 0
}

export function uuidV4(): string {
  return crypto.randomUUID()
}

export function uuidV7(now = Date.now()): string {
  const b = crypto.getRandomValues(new Uint8Array(16))
  const ts = BigInt(now)
  for (let i = 0; i < 6; i++) b[i] = Number((ts >> BigInt(8 * (5 - i))) & 0xffn)
  b[6] = (b[6] & 0x0f) | 0x70
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
