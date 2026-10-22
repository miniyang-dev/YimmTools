/** sRGB colour parsing, formatting and WCAG contrast. Channels are kept as 0–1 floats; only output rounds. */

export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const trim = (x: number, digits: number) => String(Number(x.toFixed(digits)))

// ---------- parsing ----------

const NUM = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?`
const ARG = String.raw`(${NUM})(%|deg|grad|rad|turn)?`

/** Numbers of a functional notation, comma- or space-separated, with an optional `/ alpha`. */
function args(body: string): { value: number; unit: string }[] | null {
  const parts = body
    .trim()
    .replace(/\s*\/\s*/, ' / ')
    .split(/\s*,\s*|\s+/)
    .filter((p) => p !== '/')
  const out: { value: number; unit: string }[] = []
  for (const p of parts) {
    const m = new RegExp(`^${ARG}$`, 'i').exec(p)
    if (!m) return null
    out.push({ value: parseFloat(m[1]), unit: (m[2] ?? '').toLowerCase() })
  }
  return out
}

const alphaOf = (x: { value: number; unit: string } | undefined) =>
  x === undefined ? 1 : clamp01(x.unit === '%' ? x.value / 100 : x.value)

function hueOf({ value, unit }: { value: number; unit: string }): number {
  const deg =
    unit === 'turn' ? value * 360 : unit === 'rad' ? (value * 180) / Math.PI : unit === 'grad' ? value * 0.9 : value
  return ((deg % 360) + 360) % 360
}

function parseHex(s: string): Rgba | null {
  const m = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s)
  if (!m) return null
  let h = m[1]
  if (h.length <= 4) h = [...h].map((c) => c + c).join('')
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) : 1 }
}

/**
 * Parse hex, rgb()/rgba(), hsl()/hsla() and oklch(). Anything else (named colours, lab(), color())
 * returns null; the UI then asks the browser.
 */
export function parseColor(input: string): Rgba | null {
  const s = input.trim().toLowerCase()
  if (!s) return null
  const hex = parseHex(s)
  if (hex) return hex
  const fn = /^(rgba?|hsla?|oklch)\((.*)\)$/.exec(s)
  if (!fn) return null
  const a = args(fn[2])
  if (!a || a.length < 3 || a.length > 4) return null
  const [x, y, z, alpha] = a
  if (fn[1].startsWith('rgb')) {
    const ch = (v: { value: number; unit: string }) => clamp01(v.unit === '%' ? v.value / 100 : v.value / 255)
    return { r: ch(x), g: ch(y), b: ch(z), a: alphaOf(alpha) }
  }
  if (fn[1].startsWith('hsl')) {
    return { ...hslToRgb(hueOf(x), clamp01(y.value / 100), clamp01(z.value / 100)), a: alphaOf(alpha) }
  }
  const l = clamp01(x.unit === '%' ? x.value / 100 : x.value)
  const c = Math.max(0, y.unit === '%' ? (y.value / 100) * 0.4 : y.value)
  return { ...oklchToRgb(l, c, hueOf(z)), a: alphaOf(alpha) }
}

// ---------- conversions ----------

function hslToRgb(h: number, s: number, l: number): Omit<Rgba, 'a'> {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  return { r: f(0), g: f(8), b: f(4) }
}

export function toHsl({ r, g, b }: Rgba): { h: number; s: number; l: number } {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: (h * 60 + 360) % 360, s, l }
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const fromLinear = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)

/** sRGB → OKLCH (Björn Ottosson's OKLab). l is 0–1. */
export function toOklch({ r, g, b }: Rgba): { l: number; c: number; h: number } {
  const [lr, lg, lb] = [r, g, b].map(toLinear)
  const l_ = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m_ = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s_ = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
  const c = Math.hypot(A, B)
  return { l: L, c, h: c < 1e-4 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 }
}

/** OKLCH → sRGB, clipped to the sRGB gamut. */
export function oklchToRgb(L: number, C: number, H: number): Omit<Rgba, 'a'> {
  const A = C * Math.cos((H * Math.PI) / 180)
  const B = C * Math.sin((H * Math.PI) / 180)
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  const ch = (x: number) => clamp01(fromLinear(x))
  return {
    r: ch(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: ch(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: ch(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  }
}

// ---------- formatting ----------

const byte = (x: number) => Math.round(clamp01(x) * 255)

export function formatHex(c: Rgba): string {
  const hex = (x: number) => byte(x).toString(16).padStart(2, '0')
  return `#${hex(c.r)}${hex(c.g)}${hex(c.b)}${c.a < 1 ? hex(c.a) : ''}`
}

export function formatRgb(c: Rgba): string {
  const rgb = `${byte(c.r)}, ${byte(c.g)}, ${byte(c.b)}`
  return c.a < 1 ? `rgba(${rgb}, ${trim(c.a, 3)})` : `rgb(${rgb})`
}

export function formatHsl(c: Rgba): string {
  const { h, s, l } = toHsl(c)
  const body = `${trim(h, 1)}, ${trim(s * 100, 1)}%, ${trim(l * 100, 1)}%`
  return c.a < 1 ? `hsla(${body}, ${trim(c.a, 3)})` : `hsl(${body})`
}

export function formatOklch(c: Rgba): string {
  const { l, c: chroma, h } = toOklch(c)
  const alpha = c.a < 1 ? ` / ${trim(c.a, 3)}` : ''
  return `oklch(${trim(l * 100, 2)}% ${trim(chroma, 4)} ${trim(h, 2)}${alpha})`
}

/** The same colour after rounding to 8-bit channels — what a hex code can actually hold. */
export const quantize = (c: Rgba): Rgba => ({
  r: byte(c.r) / 255,
  g: byte(c.g) / 255,
  b: byte(c.b) / 255,
  a: Math.round(c.a * 255) / 255,
})

// ---------- WCAG 2 contrast ----------

/** `top` painted over `bottom` (alpha compositing in sRGB, as browsers do). */
export function over(top: Rgba, bottom: Rgba): Rgba {
  const mix = (x: number, y: number) => x * top.a + y * (1 - top.a)
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a: 1 }
}

const WHITE: Rgba = { r: 1, g: 1, b: 1, a: 1 }

export function luminance({ r, g, b }: Rgba): number {
  const [lr, lg, lb] = [r, g, b].map(toLinear)
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb
}

/** Contrast ratio (1–21) of text colour `fg` on background `bg`. A translucent background sits on white. */
export function contrast(fg: Rgba, bg: Rgba): number {
  const back = bg.a < 1 ? over(bg, WHITE) : bg
  const front = fg.a < 1 ? over(fg, back) : fg
  const [hi, lo] = [luminance(front), luminance(back)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** WCAG 2.2 thresholds: AA / AAA for normal and large text, and 3:1 for UI parts and graphics. */
export const LEVELS = [
  { id: 'aaNormal', min: 4.5 },
  { id: 'aaLarge', min: 3 },
  { id: 'aaaNormal', min: 7 },
  { id: 'aaaLarge', min: 4.5 },
  { id: 'ui', min: 3 },
] as const

/** Ratios are shown truncated, never rounded up: 4.496 must not read as a passing "4.50". */
export const formatRatio = (ratio: number) => `${(Math.floor(ratio * 100) / 100).toFixed(2)}:1`

/**
 * The closest text colour that reaches `target` on `bg`: same OKLCH hue and chroma, lightness moved as
 * little as possible (darker or lighter, whichever is nearer). Returned already rounded to 8-bit, and the
 * rounded value itself is what was checked. Null when the colour already passes or nothing reaches it.
 */
export function nearestPassing(fg: Rgba, bg: Rgba, target: number): Rgba | null {
  if (contrast(fg, bg) >= target) return null
  const { l, c, h } = toOklch(fg)
  const STEP = 0.002
  for (let d = STEP; d <= 1; d += STEP) {
    for (const L of [l - d, l + d]) {
      if (L < 0 || L > 1) continue
      const candidate = quantize({ ...oklchToRgb(L, c, h), a: fg.a })
      if (contrast(candidate, bg) >= target) return candidate
    }
  }
  return null
}
