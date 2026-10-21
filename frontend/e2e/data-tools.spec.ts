import { expect, test, type Page } from '@playwright/test'
import { open, out } from './helpers'

test.describe('JSON formatter', () => {
  test.beforeEach(({ page }) => open(page, 'json'))

  test('formats with 2/4/tab indent, minifies and sorts keys', async ({ page }) => {
    await page.getByLabel('JSON', { exact: true }).fill('{"b":2,"a":{"d":1,"c":[1,2]}}')
    await expect(out(page)).toHaveText(
      '{\n  "b": 2,\n  "a": {\n    "d": 1,\n    "c": [\n      1,\n      2\n    ]\n  }\n}',
    )
    await page.getByRole('button', { name: '4', exact: true }).click()
    await expect(out(page)).toContainText('\n    "a": {')
    await page.getByRole('button', { name: 'Tab', exact: true }).click()
    await expect(out(page)).toContainText('\n\t"a"')
    await page.getByLabel('Sort keys').check()
    expect((await out(page).innerText()).indexOf('"a"')).toBeLessThan((await out(page).innerText()).indexOf('"b"'))
    await page.getByRole('button', { name: 'Minify' }).click()
    await expect(out(page)).toHaveText('{"a":{"c":[1,2],"d":1},"b":2}')
  })

  test('never changes the data: big integers, exponents, number spelling and key order survive', async ({ page }) => {
    await page
      .getByLabel('JSON', { exact: true })
      .fill('{"2":1,"1":2,"id":12345678901234567890,"huge":1e400,"x":1.0,"y":-0.50}')
    await expect(out(page)).toContainText('12345678901234567890')
    const text = await out(page).innerText()
    expect(text).toContain('12345678901234567890')
    expect(text).toContain('1e400')
    expect(text).toContain('"x": 1.0')
    expect(text).toContain('"y": -0.50')
    expect(text.indexOf('"2"')).toBeLessThan(text.indexOf('"1"'))
  })

  test('points at the syntax error and shows the size change when valid', async ({ page }) => {
    const box = page.getByLabel('JSON', { exact: true })
    await box.fill('{"a": 1,\n "b": [1, 2,]}')
    await expect(page.getByRole('alert')).toContainText('line 2, column 13')
    await expect(page.getByRole('alert').locator('pre')).toContainText('^')
    await box.fill('{"a":    1}')
    await expect(page.getByRole('status').filter({ hasText: 'Valid JSON' })).toContainText('bytes')
    await box.fill('"just a string"')
    await expect(page.getByRole('status').filter({ hasText: 'Valid JSON' })).toBeVisible()
  })

  test('shows line numbers that follow the content and the scroll position', async ({ page }) => {
    const box = page.getByLabel('JSON', { exact: true })
    const gutter = page.locator('.code-gutter')
    await box.fill('{\n  "a": 1,\n  "b": 2\n}')
    await expect(gutter.locator('.code-numbers')).toHaveText('1\n2\n3\n4')
    // a long line does not wrap, so numbering stays aligned
    await box.fill('{"long": "' + 'x'.repeat(2000) + '"}')
    await expect(gutter.locator('.code-numbers')).toHaveText('1')
    const lines = Array.from({ length: 200 }, (_, i) => `  "k${i}": ${i},`).join('\n')
    await box.fill(`{\n${lines}\n  "end": 0\n}`)
    await expect(gutter.locator('.code-numbers')).toContainText('203')
    await box.evaluate((el) => (el.scrollTop = 1500))
    await expect.poll(() => gutter.evaluate((g) => g.scrollTop)).toBe(1500)
  })

  test('a missing comma is reported on the line where it is missing, and "go to line" jumps there', async ({
    page,
  }) => {
    const box = page.getByLabel('JSON', { exact: true })
    const text =
      '{\n  "name": "王小明",\n  "age": 25,\n  "isStudent": false\n  "skills": ["JavaScript", "Python", "HTML"]\n}'
    await box.fill(text)
    await expect(page.getByRole('alert')).toContainText('Probably a missing comma at the end of line 4')
    await expect(page.locator('.code-mark')).toHaveAttribute('style', /\+ 66px/) // 4th line: 3 × 22px down
    await page.getByRole('button', { name: 'Go to line 4' }).click()
    await expect(box).toBeFocused()
    const caret = await box.evaluate((el: HTMLTextAreaElement) => el.selectionStart)
    expect(caret).toBe(text.indexOf('false') + 'false'.length)
    // fixing it clears the marker
    await box.fill(text.replace('false\n', 'false,\n'))
    await expect(page.locator('.code-mark')).toHaveCount(0)
    await expect(page.getByRole('status').filter({ hasText: 'Valid JSON' })).toBeVisible()
  })

  test('sample and clear buttons work; output can be copied', async ({ page }) => {
    await page.getByRole('button', { name: 'Use sample' }).click()
    await expect(out(page)).toContainText('"roles"')
    await page.getByRole('button', { name: 'Copy' }).click()
    await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('"roles"')
    await page.getByRole('button', { name: 'Clear' }).click()
    await expect(page.getByLabel('JSON', { exact: true })).toHaveValue('')
  })
})

test.describe('YAML / CSV / JSON converter', () => {
  test.beforeEach(({ page }) => open(page, 'convert'))

  async function convert(page: Page, from: string, to: string, input: string) {
    await page.getByRole('group', { name: 'From' }).getByRole('button', { name: from }).click()
    await page.getByRole('group', { name: 'To' }).getByRole('button', { name: to }).click()
    await page.getByLabel('Input', { exact: true }).fill(input)
  }

  test('converts between every pair', async ({ page }) => {
    await convert(page, 'JSON', 'YAML', '{"a":[1,2],"b":{"c":"x"}}')
    await expect(out(page)).toHaveText('a:\n  - 1\n  - 2\nb:\n  c: x\n')
    await convert(page, 'YAML', 'CSV', '- {n: a, v: 1}\n- {n: b, v: 2}\n')
    await expect(out(page)).toHaveText(/^n,v\r?\na,1\r?\nb,2/)
    await convert(page, 'CSV', 'JSON', 'n,v\na,1\nb,2')
    expect(JSON.parse(await out(page).innerText())).toEqual([
      { n: 'a', v: 1 },
      { n: 'b', v: 2 },
    ])
  })

  test('CSV cells keep their exact text (leading zeros, trailing zeros, long ids)', async ({ page }) => {
    await convert(page, 'CSV', 'JSON', 'zip,phone,price,id\n00123,0912345678,1.50,12345678901234567890\n')
    expect(JSON.parse(await out(page).innerText())).toEqual([
      { zip: '00123', phone: '0912345678', price: '1.50', id: '12345678901234567890' },
    ])
  })

  test('big integers survive JSON → YAML/CSV and YAML → JSON', async ({ page }) => {
    await convert(page, 'JSON', 'YAML', '{"id":12345678901234567890}')
    await expect(out(page)).toContainText('12345678901234567890')
    await convert(page, 'JSON', 'CSV', '[{"id":12345678901234567890}]')
    await expect(out(page)).toContainText('12345678901234567890')
    await convert(page, 'YAML', 'JSON', 'id: 12345678901234567890')
    await expect(out(page)).toContainText('"id": 12345678901234567890')
  })

  test('explains errors instead of failing silently', async ({ page }) => {
    await convert(page, 'JSON', 'CSV', '[1,2]')
    await expect(page.getByRole('alert')).toContainText('array of objects')
    await convert(page, 'JSON', 'YAML', '{bad')
    await expect(page.getByRole('alert')).toContainText("Couldn't parse JSON")
    await convert(page, 'YAML', 'JSON', 'a: [1,')
    await expect(page.getByRole('alert')).toContainText("Couldn't parse YAML")
  })

  test('YAML / JSON / CSV errors are marked on their line, with a jump to it', async ({ page }) => {
    const input = page.getByLabel('Input', { exact: true })
    const gutter = page.locator('.code-gutter')

    await convert(page, 'YAML', 'JSON', 'name: ok\nlist:\n  - a\n  - [b\nnext: 1\n')
    await expect(gutter.locator('.code-numbers')).toHaveText('1\n2\n3\n4\n5\n6')
    const goTo = page.getByRole('button', { name: /^Go to line \d+$/ })
    await expect(goTo).toBeVisible()
    const line = Number((await goTo.innerText()).match(/\d+/)![0])
    expect(line).toBeGreaterThanOrEqual(4)
    await expect(page.locator('.code-mark')).toHaveAttribute('style', new RegExp(`\\+ ${(line - 1) * 22}px`))
    await goTo.click()
    await expect(input).toBeFocused()

    await convert(page, 'JSON', 'YAML', '{\n  "a": 1,\n  "b": false\n  "c": 2\n}')
    await expect(page.getByRole('button', { name: 'Go to line 3' })).toBeVisible()

    await convert(page, 'CSV', 'JSON', 'a,b\n1,2\n3,"oops\n')
    await expect(page.getByRole('button', { name: 'Go to line 3' })).toBeVisible()

    await convert(page, 'YAML', 'JSON', 'a: 1\n')
    await expect(page.locator('.code-mark')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Go to line/ })).toHaveCount(0)
  })

  test('swap exchanges the formats and moves the result into the input', async ({ page }) => {
    await convert(page, 'JSON', 'YAML', '{"a":1}')
    await page.getByRole('button', { name: /Swap/ }).click()
    await expect(page.getByLabel('Input', { exact: true })).toHaveValue('a: 1\n')
    await expect(page.getByRole('group', { name: 'From' }).getByRole('button', { name: 'YAML' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(out(page)).toContainText('"a": 1')
  })
})

test.describe('Base64 / URL encoding', () => {
  test.beforeEach(({ page }) => open(page, 'encode'))

  test('Base64 round-trips UTF-8, supports URL-safe, rejects garbage', async ({ page }) => {
    const input = page.getByLabel('Input', { exact: true })
    await input.fill('你好 ✓')
    await expect(out(page)).toHaveText('5L2g5aW9IOKckw==')
    await page.getByRole('group', { name: 'Direction' }).getByRole('button', { name: 'Decode' }).click()
    await input.fill('5L2g5aW9IOKckw==')
    await expect(out(page)).toHaveText('你好 ✓')
    await input.fill('@@@')
    await expect(page.getByRole('alert')).toContainText('valid Base64')
    await page.getByRole('group', { name: 'Direction' }).getByRole('button', { name: 'Encode' }).click()
    await page.getByLabel(/URL-safe/).check()
    await input.fill('??>>')
    await expect(out(page)).toHaveText('Pz8-Pg')
  })

  test('URL encoding: component vs whole-URL, decoding, malformed input', async ({ page }) => {
    const input = page.getByLabel('Input', { exact: true })
    await page.getByRole('group', { name: 'Encoding' }).getByRole('button', { name: 'URL' }).click()
    await input.fill('a b&c=d/é')
    await expect(out(page)).toHaveText('a%20b%26c%3Dd%2F%C3%A9')
    await page.getByLabel(/Keep URL structure/).check()
    await expect(out(page)).toHaveText('a%20b&c=d/%C3%A9')
    await page.getByRole('group', { name: 'Direction' }).getByRole('button', { name: 'Decode' }).click()
    await input.fill('%E4%BD%A0%')
    await expect(page.getByRole('alert')).toContainText('malformed')
  })

  test('"↑ Input" feeds the output back in', async ({ page }) => {
    await page.getByLabel('Input', { exact: true }).fill('abc')
    await page.getByRole('button', { name: /↑ Input/ }).click()
    await expect(page.getByLabel('Input', { exact: true })).toHaveValue('YWJj')
  })
})

/** Screenshot of the QR canvas once it has finished (re)drawing. */
async function qrPicture(page: Page): Promise<Buffer> {
  const canvas = page.locator('.qr-box canvas')
  let previous = await canvas.screenshot()
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(120)
    const next = await canvas.screenshot()
    if (next.equals(previous)) return next
    previous = next
  }
  return previous
}

test.describe('QR code', () => {
  test('empty or oversized content shows no empty white box', async ({ page }) => {
    await open(page, 'qr')
    const box = page.locator('.qr-box')
    await expect(box).toBeVisible() // default "https://"
    const text = page.getByLabel('Content for the QR code')
    await text.fill('')
    await expect(box).toBeHidden()
    await expect(page.getByRole('button', { name: 'Download PNG' })).toBeDisabled()
    await text.fill('x'.repeat(5000))
    await expect(page.getByRole('alert')).toContainText('too much')
    await expect(box).toBeHidden()
    await text.fill('ok')
    await expect(box).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('downloads a real PNG and SVG', async ({ page }) => {
    await open(page, 'qr')
    await page.getByLabel('Content for the QR code').fill('https://example.com/a?b=1')
    const png = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download PNG' }).click()
    const pngFile = await png
    expect(pngFile.suggestedFilename()).toBe('qrcode.png')
    expect(
      (await import('node:fs'))
        .readFileSync(await pngFile.path())
        .subarray(0, 4)
        .toString('hex'),
    ).toBe('89504e47')
    const svg = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download SVG' }).click()
    const svgFile = await svg
    expect(svgFile.suggestedFilename()).toBe('qrcode.svg')
    expect((await import('node:fs')).readFileSync(await svgFile.path(), 'utf8')).toContain('<svg')
  })

  test('make → read round trip (UTF-8, every correction level), plus bad images', async ({ page }) => {
    await open(page, 'qr')
    const content = '測試 QR 內容 ✓ https://example.com/?q=1&r=2'
    await page.getByLabel('Content for the QR code').fill(content)
    for (const level of ['L', 'M', 'Q', 'H']) {
      await page
        .getByRole('group', { name: 'Error correction' })
        .getByRole('button', { name: new RegExp(`^${level} `) })
        .click()
      const png = await qrPicture(page)
      await page.getByRole('group', { name: 'QR' }).getByRole('button', { name: 'Read' }).click()
      await page.locator('input[type=file]').setInputFiles({ name: 'q.png', mimeType: 'image/png', buffer: png })
      await expect(out(page)).toHaveText(content)
      await page.getByRole('group', { name: 'QR' }).getByRole('button', { name: 'Make' }).click()
    }
    await page.getByRole('group', { name: 'QR' }).getByRole('button', { name: 'Read' }).click()
    await page
      .locator('input[type=file]')
      .setInputFiles({ name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('nope') })
    await expect(page.getByRole('alert')).toContainText("Couldn't read that image")
    const blank = await page.evaluate(() => {
      const c = document.createElement('canvas')
      c.width = c.height = 200
      c.getContext('2d')!.fillStyle = '#fff'
      c.getContext('2d')!.fillRect(0, 0, 200, 200)
      return c.toDataURL('image/png')
    })
    await page
      .locator('input[type=file]')
      .setInputFiles({ name: 'blank.png', mimeType: 'image/png', buffer: Buffer.from(blank.split(',')[1], 'base64') })
    await expect(page.getByRole('alert')).toContainText('No QR code found')
  })

  test('a decoded URL is flagged before anyone opens it', async ({ page }) => {
    await open(page, 'qr')
    await page.getByLabel('Content for the QR code').fill('https://example.com/')
    const png = await qrPicture(page)
    await page.getByRole('button', { name: 'Read' }).click()
    await page.locator('input[type=file]').setInputFiles({ name: 'q.png', mimeType: 'image/png', buffer: png })
    await expect(page.getByRole('status').filter({ hasText: 'Open it only if you trust' })).toBeVisible()
  })
})
