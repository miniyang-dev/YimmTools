import { describe, expect, it } from 'vitest'
import { MAX_MATCHES, computeDiff, runRegex } from './engine'

describe('runRegex', () => {
  it('returns nothing for an empty pattern and an error for an invalid one', () => {
    expect(runRegex('', 'g', 'abc', '')).toBeNull()
    const bad = runRegex('(', 'g', 'abc', '')
    expect(bad).toMatchObject({ kind: 'error' })
  })

  it('finds every match with groups and named groups, always globally', () => {
    const r = runRegex('(\\d+)-(?<w>[a-z]+)', '', '12-ab 7-zz', '')
    expect(r?.kind).toBe('ok')
    if (r?.kind !== 'ok') return
    expect(r.matches.map((m) => m[0])).toEqual(['12-ab', '7-zz'])
    expect(r.matches[0].groups).toEqual({ w: 'ab' })
    expect(r.replaced).toBeNull()
  })

  it('applies flags and the replacement (the replacement honours the flags as given)', () => {
    const r = runRegex('(ab)-([a-z]+)', 'gi', 'AB-cd ab-ef', '$2=$1')
    expect(r).toMatchObject({ kind: 'ok', replaced: 'cd=AB ef=ab' })
    const first = runRegex('a', '', 'aaa', 'b')
    expect(first).toMatchObject({ replaced: 'baa' }) // no g flag: only the first one is replaced
  })

  it('handles zero-width patterns and caps the number of matches', () => {
    const empty = runRegex('^', 'g', 'abc', '')
    expect(empty?.kind === 'ok' && empty.matches).toHaveLength(1)
    const many = runRegex('a', 'g', 'a'.repeat(MAX_MATCHES + 50), '')
    expect(many).toMatchObject({ kind: 'ok', truncated: true })
    expect(many?.kind === 'ok' && many.matches).toHaveLength(MAX_MATCHES)
  })
})

describe('computeDiff', () => {
  const opts = { mode: 'words' as const, ignoreCase: false, ignoreWhitespace: false }

  it('counts additions and removals', () => {
    const d = computeDiff('a\nb\nc', 'a\nB\nc\nd', { ...opts, mode: 'lines' })
    expect(d.removed).toBeGreaterThan(0)
    expect(d.added).toBeGreaterThan(0)
    expect(computeDiff('same', 'same', opts)).toMatchObject({ added: 0, removed: 0 })
  })

  it('can ignore case and whitespace, per mode', () => {
    expect(computeDiff('Hello', 'hello', opts).added).toBeGreaterThan(0)
    expect(computeDiff('Hello', 'hello', { ...opts, ignoreCase: true })).toMatchObject({ added: 0, removed: 0 })
    expect(computeDiff('x  y', 'x y', { ...opts, ignoreWhitespace: true })).toMatchObject({ added: 0, removed: 0 })
    expect(computeDiff('a b', 'a  b', opts).added).toBeGreaterThan(0)
  })

  it('works character by character', () => {
    const d = computeDiff('cat', 'cut', { ...opts, mode: 'chars' })
    expect(d).toMatchObject({ added: 1, removed: 1 })
  })
})
