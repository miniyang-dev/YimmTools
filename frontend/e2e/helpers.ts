import { createHmac } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { expect, type Locator, type Page } from '@playwright/test'

export const LANGS = ['zh-TW', 'en', 'zh-CN', 'es', 'ja'] as const

interface Meta {
  id: string
  order: number
  strings: Record<string, { name: string; desc: string }>
}

// The tools on disk are the source of truth; tests iterate over whatever is there.
const toolsDir = new URL('../src/tools/', import.meta.url)
const metas: Meta[] = readdirSync(toolsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => JSON.parse(readFileSync(new URL(`${d.name}/meta.json`, toolsDir), 'utf8')) as Meta)
  .sort((a, b) => a.order - b.order)

export const TOOL_IDS: string[] = metas.map((m) => m.id)

type Lang = (typeof LANGS)[number]
export const toolText = (lang: Lang, id: string, field: 'name' | 'desc'): string =>
  metas.find((m) => m.id === id)!.strings[lang][field]

/** Open a tool page (English by default) and wait for its heading. */
export async function open(page: Page, tool: string, lang: Lang = 'en'): Promise<void> {
  await page.goto(`/${lang}/${tool}`)
  await expect(page.locator('article .tool-head h1')).toBeVisible()
}

/** The read-only output block of a tool. */
export const out = (page: Page, nth = 0): Locator => page.locator('pre.out').nth(nth)

/** A real PNG drawn in the browser (no fixture files to keep in the repo). */
export async function pngBuffer(page: Page, width: number, height: number): Promise<Buffer> {
  const dataUrl = await page.evaluate(
    ([w, h]) => {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const x = c.getContext('2d')!
      for (let i = 0; i < 300; i++) {
        x.fillStyle = `hsl(${(i * 37) % 360} 70% ${30 + (i % 40)}%)`
        x.fillRect((i * 53) % w, (i * 91) % h, w / 8, h / 8)
      }
      return c.toDataURL('image/png')
    },
    [width, height] as const,
  )
  return Buffer.from(dataUrl.split(',')[1], 'base64')
}

/** RFC 6238 computed with node:crypto — an implementation independent of the app's own. */
export function totpNode(
  secret: Buffer,
  unixSeconds: number,
  opts: { algo?: string; digits?: number; period?: number } = {},
): string {
  const { algo = 'sha1', digits = 6, period = 30 } = opts
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(unixSeconds / period)))
  const h = createHmac(algo, secret).update(counter).digest()
  const o = h[h.length - 1] & 0x0f
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]
  return String(bin % 10 ** digits).padStart(digits, '0')
}

/** "12345678901234567890" — the secret used by the RFC 6238 test vectors. */
export const RFC_SECRET = Buffer.from('12345678901234567890')
export const RFC_SECRET_B32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

export const b64url = (o: unknown): string =>
  Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')

export const hex = (b: Buffer): string => b.toString('hex')
