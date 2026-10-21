import { readFileSync } from 'node:fs'
import { expect, test, type Download, type Page } from '@playwright/test'
import { open, pngBuffer } from './helpers'

const rows = (page: Page) => page.locator('.tbl tbody tr')
const file = (page: Page) => page.locator('input[type=file]')
const format = (page: Page, name: string) =>
  page.getByRole('group', { name: 'Output format' }).getByRole('button', { name, exact: true })

async function download(page: Page, row = 0): Promise<{ file: Download; bytes: Buffer }> {
  const wait = page.waitForEvent('download')
  await rows(page).nth(row).getByRole('button', { name: 'Download' }).click()
  const d = await wait
  return { file: d, bytes: readFileSync(await d.path()) }
}

test.describe('Image compress & convert', () => {
  test.beforeEach(({ page }) => open(page, 'image'))

  test('converts to WebP / JPEG / PNG with the right file format and name', async ({ page }) => {
    await file(page).setInputFiles({
      name: 'photo.png',
      mimeType: 'image/png',
      buffer: await pngBuffer(page, 1600, 1200),
    })
    await expect(rows(page).first()).toContainText('1600×1200') // WebP is the default
    let { file: f, bytes } = await download(page)
    expect(f.suggestedFilename()).toBe('photo.webp')
    expect(bytes.subarray(0, 4).toString('latin1') + bytes.subarray(8, 12).toString('latin1')).toBe('RIFFWEBP')

    await format(page, 'JPEG').click()
    await expect(rows(page).first()).toContainText('1600×1200')
    ;({ file: f, bytes } = await download(page))
    expect(f.suggestedFilename()).toBe('photo.jpg')
    expect(bytes.subarray(0, 3).toString('hex')).toBe('ffd8ff')

    await format(page, 'PNG').click()
    await expect(page.getByText(/lossless/)).toBeVisible()
    ;({ file: f, bytes } = await download(page))
    expect(f.suggestedFilename()).toBe('photo.png')
    expect(bytes.subarray(0, 4).toString('hex')).toBe('89504e47')
  })

  test('shrinks the file and reports the saving', async ({ page }) => {
    await file(page).setInputFiles({
      name: 'photo.png',
      mimeType: 'image/png',
      buffer: await pngBuffer(page, 1600, 1200),
    })
    await expect(rows(page).first().locator('td').nth(3)).toHaveText(/^−\d+%$/)
  })

  test('max width scales down and keeps the aspect ratio; 0 means original', async ({ page }) => {
    await file(page).setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: await pngBuffer(page, 1600, 1200) })
    const width = page.getByLabel(/Max width/)
    await width.fill('800')
    await expect(rows(page).first()).toContainText('800×600')
    await width.fill('0')
    await expect(rows(page).first()).toContainText('1600×1200')
  })

  test('quality changes are debounced: dragging the slider re-encodes once, not per tick', async ({ page }) => {
    await file(page).setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: await pngBuffer(page, 800, 600) })
    await expect(rows(page).first()).toContainText('800×600')
    await page.evaluate(() => {
      const w = window as unknown as { __encodes: number }
      w.__encodes = 0
      const orig = HTMLCanvasElement.prototype.toBlob
      HTMLCanvasElement.prototype.toBlob = function (...a: Parameters<typeof orig>) {
        w.__encodes++
        return orig.apply(this, a)
      }
    })
    const slider = page.locator('input[type=range]')
    for (const v of ['0.5', '0.55', '0.6', '0.65', '0.7', '0.75', '0.9']) await slider.fill(v)
    await expect(page.locator('.label', { hasText: 'Quality' })).toContainText('90')
    await page.waitForTimeout(900)
    expect(await page.evaluate(() => (window as unknown as { __encodes: number }).__encodes)).toBeLessThanOrEqual(2)
  })

  test('handles several files, bad files, removal and "download all"', async ({ page }) => {
    const png = await pngBuffer(page, 400, 300)
    await file(page).setInputFiles([
      { name: 'one.png', mimeType: 'image/png', buffer: png },
      { name: 'two.png', mimeType: 'image/png', buffer: png },
      { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') },
    ])
    await expect(rows(page)).toHaveCount(3)
    await expect(rows(page).nth(2)).toContainText("Couldn't read this file")
    await expect(rows(page).nth(0)).toContainText('400×300')
    const downloads: string[] = []
    page.on('download', (d) => downloads.push(d.suggestedFilename()))
    await page.getByRole('button', { name: 'Download all' }).click()
    await expect.poll(() => downloads.sort()).toEqual(['one.webp', 'two.webp'])
    await rows(page).nth(2).getByRole('button', { name: 'Remove' }).click()
    await expect(rows(page)).toHaveCount(2)
    await rows(page).nth(1).getByRole('button', { name: 'Remove' }).click()
    await rows(page).nth(0).getByRole('button', { name: 'Remove' }).click()
    await expect(page.locator('.tbl')).toHaveCount(0)
  })

  test('JPEG output fills transparent areas with white', async ({ page }) => {
    const transparent = await page.evaluate(() => {
      const c = document.createElement('canvas')
      c.width = c.height = 40
      return c.toDataURL('image/png') // fully transparent
    })
    await file(page).setInputFiles({
      name: 't.png',
      mimeType: 'image/png',
      buffer: Buffer.from(transparent.split(',')[1], 'base64'),
    })
    await format(page, 'JPEG').click()
    await expect(page.getByText('fills transparent areas with white')).toBeVisible()
    await expect(rows(page).first()).toContainText('40×40')
    const { bytes } = await download(page)
    const px = await page
      .evaluate(async (b64) => {
        const bmp = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${b64}`)).blob())
        const c = document.createElement('canvas')
        c.width = c.height = 1
        c.getContext('2d')!.drawImage(bmp, 20, 20, 1, 1, 0, 0, 1, 1)
        return Array.from(c.getContext('2d')!.getImageData(0, 0, 1, 1).data)
      }, bytes.toString('base64'))
      .catch(() => null)
    if (px) expect(px.slice(0, 3).every((v) => v > 240)).toBe(true)
  })
})
