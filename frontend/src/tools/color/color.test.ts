import { describe, expect, it } from 'vitest'
import {
  contrast,
  formatHex,
  formatHsl,
  formatOklch,
  formatRatio,
  formatRgb,
  nearestPassing,
  parseColor,
  type Rgba,
} from './color'

const c = (s: string) => {
  const v = parseColor(s)
  if (!v) throw new Error(`unparsed: ${s}`)
  return v
}

describe('parseColor', () => {
  it('reads every hex length, with or without #', () => {
    expect(formatHex(c('#f00'))).toBe('#ff0000')
    expect(formatHex(c('f00'))).toBe('#ff0000')
    expect(formatHex(c('#F008'))).toBe('#ff000088')
    expect(formatHex(c('#1B1A17'))).toBe('#1b1a17')
    expect(formatHex(c('#11223344'))).toBe('#11223344')
  })

  it('reads rgb/hsl in legacy comma and modern space syntax, with alpha', () => {
    expect(formatHex(c('rgb(27, 26, 23)'))).toBe('#1b1a17')
    expect(formatHex(c('rgb(27 26 23)'))).toBe('#1b1a17')
    expect(formatRgb(c('rgba(255,0,0,.5)'))).toBe('rgba(255, 0, 0, 0.5)')
    expect(formatRgb(c('rgb(100% 0% 0% / 25%)'))).toBe('rgba(255, 0, 0, 0.25)')
    expect(formatHex(c('hsl(120, 100%, 50%)'))).toBe('#00ff00')
    expect(formatHex(c('hsl(0.5turn 100% 50%)'))).toBe('#00ffff')
    expect(formatHex(c('hsla(240deg 100% 50% / 1)'))).toBe('#0000ff')
  })

  it('reads oklch and round-trips through it', () => {
    // CSS Color 4 reference values for sRGB red
    expect(formatHex(c('oklch(62.8% 0.2577 29.23)'))).toBe('#ff0000')
    expect(formatOklch(c('#ff0000'))).toBe('oklch(62.8% 0.2577 29.23)')
    expect(formatOklch(c('#ffffff'))).toBe('oklch(100% 0 0)')
    for (const hex of ['#1b1a17', '#b02a1b', '#2c6a3f', '#ec7a67', '#808080']) {
      expect(formatHex(c(formatOklch(c(hex))))).toBe(hex)
    }
  })

  it('refuses what it does not understand (the UI then asks the browser)', () => {
    for (const s of ['', 'red', '#12', '#12345', 'rgb(1,2)', 'rgb(a,b,c)', 'lab(50% 10 10)']) {
      expect(parseColor(s), s).toBeNull()
    }
  })
})

describe('formatting', () => {
  it('writes hsl with trimmed decimals', () => {
    expect(formatHsl(c('#ff0000'))).toBe('hsl(0, 100%, 50%)')
    expect(formatHsl(c('#1b1a17'))).toBe('hsl(45, 8%, 9.8%)')
    expect(formatHsl(c('#80808080'))).toBe('hsla(0, 0%, 50.2%, 0.502)')
  })
})

describe('WCAG contrast', () => {
  it('matches the reference values', () => {
    expect(contrast(c('#000'), c('#fff'))).toBeCloseTo(21, 5)
    expect(contrast(c('#fff'), c('#fff'))).toBeCloseTo(1, 5)
    expect(formatRatio(contrast(c('#777777'), c('#ffffff')))).toBe('4.47:1') // the classic just-fails-AA grey
    expect(formatRatio(contrast(c('#767676'), c('#ffffff')))).toBe('4.54:1')
    // order does not matter
    expect(contrast(c('#ffffff'), c('#767676'))).toBeCloseTo(contrast(c('#767676'), c('#ffffff')), 10)
  })

  it('never rounds a failing ratio up to a passing one', () => {
    expect(formatRatio(4.4999)).toBe('4.49:1')
  })

  it('composites translucent text over its background', () => {
    // 50% black on white is an exact 50% grey in effect
    expect(contrast(c('rgba(0,0,0,.5)'), c('#fff'))).toBeCloseTo(contrast(c('rgb(50% 50% 50%)'), c('#fff')), 10)
  })

  it('finds the nearest passing text colour, checked after rounding to hex', () => {
    const bg = c('#ffffff')
    const fg = c('#999999')
    const fixed = nearestPassing(fg, bg, 4.5) as Rgba
    expect(contrast(fixed, bg)).toBeGreaterThanOrEqual(4.5)
    expect(formatHex(fixed)).toBe(formatHex(c(formatHex(fixed)))) // already 8-bit
    // nearest: no darker than needed (#767676 is the lightest grey that passes on white)
    expect(contrast(fixed, bg)).toBeLessThan(4.7)
    expect(nearestPassing(c('#000'), bg, 4.5)).toBeNull() // already passes
  })

  it('goes lighter when the background is dark', () => {
    const bg = c('#15171b')
    const fixed = nearestPassing(c('#555555'), bg, 7) as Rgba
    expect(contrast(fixed, bg)).toBeGreaterThanOrEqual(7)
    expect(fixed.r).toBeGreaterThan(c('#555555').r)
  })
})
