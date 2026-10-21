import { describe, expect, it } from 'vitest'
import common from './common.json'

type Dicts = Record<string, Record<string, string>>

const toolFiles = import.meta.glob('../tools/*/strings.json', { eager: true, import: 'default' }) as Record<
  string,
  Dicts
>
const files: Record<string, Dicts> = { 'i18n/common.json': common as unknown as Dicts, ...toolFiles }
const LANGS = ['zh-TW', 'en', 'zh-CN', 'es', 'ja']
const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',')

describe.each(Object.entries(files))('%s', (_name, dicts) => {
  it('has every language', () => {
    for (const l of LANGS) expect(dicts[l], `missing ${l}`).toBeTruthy()
  })
  it('has identical keys in every language', () => {
    const base = Object.keys(dicts['zh-TW']).sort()
    for (const l of LANGS) expect(Object.keys(dicts[l]).sort(), l).toEqual(base)
  })
  it('keeps {placeholders} identical and never leaves a value empty', () => {
    for (const [key, zh] of Object.entries(dicts['zh-TW'])) {
      for (const l of LANGS) {
        const v = dicts[l][key]
        expect(v, `${l}:${key}`).not.toBe('')
        expect(vars(v), `${l}:${key}`).toBe(vars(zh))
      }
    }
  })
})

const metaFiles = import.meta.glob('../tools/*/meta.json', { eager: true, import: 'default' }) as Record<
  string,
  {
    id: string
    group: string
    order: number
    server: boolean
    strings: Dicts
  }
>

describe('tool registry (meta.json)', () => {
  const metas = Object.entries(metaFiles)

  it('finds every tool folder and keeps ids and orders unique', () => {
    expect(metas.length).toBeGreaterThanOrEqual(14)
    const ids = metas.map(([, m]) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    const orders = metas.map(([, m]) => m.order)
    expect(new Set(orders).size).toBe(orders.length)
    expect(Math.min(...orders)).toBe(1)
    expect(Math.max(...orders)).toBe(orders.length) // contiguous: the numbers shown in the contents have no gaps
  })

  it.each(metas)('%s: id matches its folder, group is known, names exist in every language', (path, m) => {
    expect(m.id).toBe(path.split('/')[2])
    expect(['image', 'data', 'security', 'text', 'net']).toContain(m.group)
    expect(typeof m.server).toBe('boolean')
    if ('badge' in m) expect(typeof (m as { badge?: unknown }).badge).toBe('string')
    for (const l of LANGS) {
      expect(m.strings[l]?.name, `${l}:${m.id}.name`).toBeTruthy()
      expect(m.strings[l]?.desc, `${l}:${m.id}.desc`).toBeTruthy()
    }
  })

  it('buildTools sorts by order and refuses inconsistent folders', async () => {
    const { buildTools, TOOLS } = await import('../tools/registry')
    expect(TOOLS.map((t) => t.order)).toEqual(TOOLS.map((_, i) => i + 1))
    const meta = (id: string, order: number) => ({
      id,
      group: 'data' as const,
      order,
      server: false,
      strings: { 'zh-TW': {} },
    })
    const loader = {
      './a/index.tsx': async () => ({ default: () => null }),
      './b/index.tsx': async () => ({ default: () => null }),
    }
    expect(
      buildTools({ './b/meta.json': meta('b', 2), './a/meta.json': meta('a', 1) }, loader).map((t) => t.id),
    ).toEqual(['a', 'b'])
    expect(() => buildTools({ './a/meta.json': meta('wrong', 1) }, loader)).toThrow(/must match the folder/)
    expect(() => buildTools({ './z/meta.json': meta('z', 1) }, loader)).toThrow(/without an index/)
    expect(() => buildTools({ './a/meta.json': meta('a', 1), './b/meta.json': meta('b', 1) }, loader)).toThrow(
      /duplicate/,
    )
  })
})
