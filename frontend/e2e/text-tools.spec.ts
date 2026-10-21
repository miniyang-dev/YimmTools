import { expect, test, type Page } from '@playwright/test'
import { open, out } from './helpers'

const kv = (page: Page) => page.locator('.kv dd')

test.describe('Timestamp & cron', () => {
  test.beforeEach(({ page }) => open(page, 'time'))
  const input = (page: Page) => page.getByLabel('Timestamp or date')

  test('detects seconds vs milliseconds and converts', async ({ page }) => {
    await input(page).fill('1735689600')
    await expect(kv(page).nth(0)).toHaveText('1735689600')
    await expect(kv(page).nth(1)).toHaveText('1735689600000')
    await expect(kv(page).nth(2)).toHaveText('2025-01-01T00:00:00.000Z')
    await expect(page.getByText('Read as seconds')).toBeVisible()
    await input(page).fill('1735689600123')
    await expect(kv(page).nth(0)).toHaveText('1735689600')
    await expect(page.getByText('Read as milliseconds')).toBeVisible()
    await input(page).fill('0')
    await expect(kv(page).nth(2)).toHaveText('1970-01-01T00:00:00.000Z')
  })

  test('bare dates and times are read in the chosen time zone, not the browser zone', async ({ page }) => {
    const zone = page.getByLabel('Time zone')
    await zone.selectOption('Asia/Tokyo')
    await input(page).fill('2025-01-31 08:00')
    await expect(kv(page).nth(2)).toHaveText('2025-01-30T23:00:00.000Z') // 08:00 in Tokyo
    await zone.selectOption('America/New_York')
    await expect(kv(page).nth(2)).toHaveText('2025-01-31T13:00:00.000Z')
    await input(page).fill('2025-07-01 12:00') // daylight saving
    await expect(kv(page).nth(2)).toHaveText('2025-07-01T16:00:00.000Z')
    await zone.selectOption('local') // the browser's own zone (Asia/Taipei in this config)
    await input(page).fill('2025-01-31') // date only = midnight in that zone
    await expect(kv(page).nth(2)).toHaveText('2025-01-30T16:00:00.000Z')
    await input(page).fill('2025-01-31T08:00:00+08:00') // an explicit offset wins over the zone
    await expect(kv(page).nth(2)).toHaveText('2025-01-31T00:00:00.000Z')
  })

  test('rejects impossible dates and nonsense', async ({ page }) => {
    for (const bad of ['garbage', '2025-02-30', '2025-13-01', '2025-01-01 25:00']) {
      await input(page).fill(bad)
      await expect(page.getByRole('alert')).toContainText("couldn't be recognised")
    }
    await input(page).fill('')
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('"Use current time" fills a plausible Unix time', async ({ page }) => {
    await page.getByRole('button', { name: 'Use current time' }).click()
    const v = Number(await input(page).inputValue())
    expect(Math.abs(v - Date.now() / 1000)).toBeLessThan(5)
  })

  test('cron: plain-words description and the next runs in the chosen zone', async ({ page }) => {
    await page.getByRole('group', { name: 'mode' }).getByRole('button', { name: 'Cron' }).click()
    await page.getByLabel('Time zone').selectOption('Asia/Tokyo')
    const cron = page.getByLabel('Cron expression')
    await cron.fill('0 9 * * 1')
    await expect(page.getByText(/Monday/).first()).toBeVisible()
    const runs = page.locator('article ol li')
    await expect(runs).toHaveCount(6)
    for (const t of await runs.allInnerTexts()) {
      expect(t).toContain('Monday')
      expect(t).toMatch(/9:00:00/)
    }
    await cron.fill('*/5 * * * * *') // six fields: seconds first
    await expect(runs).toHaveCount(6)
    await cron.fill('61 * * * *')
    await expect(page.getByRole('alert')).toContainText('valid cron')
    await cron.fill('')
    await expect(runs).toHaveCount(0)
  })
})

test.describe('Regex & diff', () => {
  test.beforeEach(({ page }) => open(page, 'regex'))

  test('lists matches with groups, named groups, and highlights them', async ({ page }) => {
    await page.getByLabel('Pattern').fill('(\\d+)-(?<w>[a-z]+)')
    await page.getByLabel('Test text').fill('12-ab 7-zz')
    await expect(page.getByRole('heading', { name: '2 matches' })).toBeVisible()
    await expect(page.locator('.tbl')).toContainText('"w":"ab"')
    await expect(page.locator('mark')).toHaveCount(2)
  })

  test('flags, replacement, invalid patterns and no-match messages', async ({ page }) => {
    await page.getByLabel('Test text').fill('AB-cd ab-ef')
    await page.getByLabel('Pattern').fill('(ab)-([a-z]+)')
    await expect(page.getByRole('heading', { name: '1 matches' })).toBeVisible()
    await page.getByLabel('i', { exact: true }).check()
    await expect(page.getByRole('heading', { name: '2 matches' })).toBeVisible()
    await page.getByLabel(/Replace with/).fill('$2=$1')
    await expect(out(page, 1)).toHaveText('cd=AB ef=ab')
    await page.getByLabel('Pattern').fill('(')
    await expect(page.getByRole('alert')).toContainText('Invalid pattern')
    await page.getByLabel('Pattern').fill('zzz')
    await expect(page.getByText('Nothing matches.')).toBeVisible()
    await page.getByLabel('Pattern').fill('^') // zero-width matches must not hang the page
    await expect(page.getByRole('heading', { name: /matches/ })).toBeVisible()
  })

  test('both diff inputs show line numbers', async ({ page }) => {
    await page.getByRole('group', { name: 'mode' }).getByRole('button', { name: 'Diff' }).click()
    await page.getByLabel('Text A (old)').fill('a\nb\nc')
    await page.getByLabel('Text B (new)').fill('a\nb')
    const gutters = page.locator('.code-gutter:visible .code-numbers')
    await expect(gutters).toHaveCount(2)
    await expect(gutters.nth(0)).toHaveText('123')
    await expect(gutters.nth(1)).toHaveText('12')
  })

  test('diff by lines / words / characters, ignore case and whitespace', async ({ page }) => {
    await page.getByRole('group', { name: 'mode' }).getByRole('button', { name: 'Diff' }).click()
    await page.getByLabel('Text A (old)').fill('a\nb\nc')
    await page.getByLabel('Text B (new)').fill('a\nB\nc\nd')
    await page.getByRole('group', { name: 'Compare by' }).getByRole('button', { name: 'Lines' }).click()
    await expect(page.locator('.diff-del').first()).toBeVisible()
    await expect(page.locator('.diff-add').first()).toBeVisible()
    await page.getByRole('group', { name: 'Compare by' }).getByRole('button', { name: 'Characters' }).click()
    await expect(page.locator('.diff-add, .diff-del').first()).toBeVisible()
    await page.getByLabel('Text A (old)').fill('Hello')
    await page.getByLabel('Text B (new)').fill('hello')
    await expect(page.locator('.notice.ok')).toHaveCount(0)
    await page.getByLabel('Ignore case').check()
    await expect(page.getByText('The two texts are identical.')).toBeVisible()
    await page.getByLabel('Ignore case').uncheck()
    await page.getByRole('group', { name: 'Compare by' }).getByRole('button', { name: 'Words' }).click()
    await page.getByLabel('Text A (old)').fill('x  y')
    await page.getByLabel('Text B (new)').fill('x y')
    await page.getByLabel('Ignore whitespace').check()
    await expect(page.getByText('The two texts are identical.')).toBeVisible()
  })
})

test.describe('Markdown preview', () => {
  test.beforeEach(({ page }) => open(page, 'markdown'))
  const source = (page: Page) => page.getByLabel('Markdown', { exact: true })

  test('renders headings, tables and code from the starter sample', async ({ page }) => {
    await expect(page.locator('.md h1')).toHaveText('Heading')
    await expect(page.locator('.md table')).toBeVisible()
    await expect(page.locator('.md strong')).toHaveText('bold')
  })

  test('sanitises scripts, handlers, styles and javascript: links; links open safely', async ({ page }) => {
    await source(page).fill(
      [
        '<script>window.__xss=1</script>',
        '',
        '<img src=x onerror="window.__xss=2">',
        '',
        '<style>*{display:none}</style>',
        '',
        '[ok](https://example.com) and [bad](javascript:alert(1))',
      ].join('\n'),
    )
    const html = await page.locator('.md').innerHTML()
    expect(html).not.toMatch(/<script|<style|onerror/i)
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
    const links = page.locator('.md a')
    await expect(links.first()).toHaveAttribute('target', '_blank')
    await expect(links.first()).toHaveAttribute('rel', /noopener/)
    for (const href of await links.evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? '')))
      expect(href).not.toMatch(/^javascript:/i)
  })

  test('line numbers stay next to the right line when paragraphs wrap', async ({ page }) => {
    await source(page).fill(`# Title\n${'A long paragraph that keeps going. '.repeat(30)}\nshort`)
    const numbers = page.locator('.code-gutter .code-numbers > div')
    await expect(numbers).toHaveCount(3)
    const tops = await numbers.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)))
    const heights = await numbers.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)))
    expect(heights[0]).toBe(22)
    expect(heights[1]).toBeGreaterThan(44) // the paragraph wraps onto several rows
    expect(tops[2] - tops[1]).toBe(heights[1]) // "3" sits right after the wrapped paragraph
  })

  test('copy HTML and clear', async ({ page }) => {
    await source(page).fill('**hi**')
    await page.getByRole('button', { name: 'Copy HTML' }).click()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('<strong>hi</strong>')
    await page.getByRole('button', { name: 'Clear' }).click()
    await expect(source(page)).toHaveValue('')
  })
})

test.describe('URL & User-Agent parser', () => {
  test.beforeEach(({ page }) => open(page, 'urlua'))

  test('splits a URL into parts and lists query parameters (duplicates, decoding)', async ({ page }) => {
    await page
      .getByLabel('URL', { exact: true })
      .fill('https://user:pw@sub.example.co.uk:8443/a%20b/c.html?x=1&x=2&y=%E4%BA%8C&empty=#frag')
    const parts = page.locator('.kv').first()
    await expect(parts).toContainText('https:')
    await expect(parts).toContainText('sub.example.co.uk')
    await expect(parts).toContainText('8443')
    await expect(parts).toContainText('/a b/c.html')
    await expect(parts).toContainText('#frag')
    const rows = page.locator('.tbl tbody tr')
    await expect(rows).toHaveCount(4)
    await expect(rows.filter({ hasText: /^x/ })).toHaveCount(2)
    await expect(rows.filter({ hasText: '二' })).toHaveCount(1)
  })

  test('default port, and a clear error for a URL without a scheme', async ({ page }) => {
    const url = page.getByLabel('URL', { exact: true })
    await url.fill('http://example.com')
    await expect(page.locator('.kv').first()).toContainText('80 (default)')
    await url.fill('example.com/no-scheme')
    await expect(page.getByRole('alert')).toContainText('complete URL')
  })

  test('recognises browsers and systems, and can read the visitor’s own', async ({ page }) => {
    const ua = page.getByLabel('User-Agent', { exact: true })
    await ua.fill(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    )
    await expect(page.locator('.kv').last()).toContainText('iOS')
    await expect(page.locator('.kv').last()).toContainText('iPhone')
    await ua.fill(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    )
    await expect(page.locator('.kv').last()).toContainText('Edge')
    await page.getByRole('button', { name: 'Use my browser' }).click()
    await expect(ua).toHaveValue(/Mozilla\/5\.0/)
    await ua.fill('')
    await expect(page.locator('.kv')).toHaveCount(0)
  })
})

test.describe('tabs keep what you typed', () => {
  test('time: timestamp input and cron expression survive switching tabs', async ({ page }) => {
    await open(page, 'time')
    await page.getByLabel('Timestamp or date').fill('1735689600')
    const modes = page.getByRole('group', { name: 'mode' })
    await modes.getByRole('button', { name: 'Cron' }).click()
    await page.getByLabel('Cron expression').fill('0 9 * * 1')
    await modes.getByRole('button', { name: 'Timestamp' }).click()
    await expect(page.getByLabel('Timestamp or date')).toHaveValue('1735689600')
    await modes.getByRole('button', { name: 'Cron' }).click()
    await expect(page.getByLabel('Cron expression')).toHaveValue('0 9 * * 1')
  })

  test('regex: pattern, text and both diff texts survive switching tabs', async ({ page }) => {
    await open(page, 'regex')
    await page.getByLabel('Pattern').fill('a+b')
    await page.getByLabel('Test text').fill('aaab')
    const modes = page.getByRole('group', { name: 'mode' })
    await modes.getByRole('button', { name: 'Diff' }).click()
    await page.getByLabel('Text A (old)').fill('one')
    await modes.getByRole('button', { name: 'Regex' }).click()
    await expect(page.getByLabel('Pattern')).toHaveValue('a+b')
    await expect(page.getByLabel('Test text')).toHaveValue('aaab')
    await modes.getByRole('button', { name: 'Diff' }).click()
    await expect(page.getByLabel('Text A (old)')).toHaveValue('one')
  })
})

test.describe('QR tab state', () => {
  test('the content typed on "Make" is still there after visiting "Read"', async ({ page }) => {
    await open(page, 'qr')
    await page.getByLabel('Content for the QR code').fill('keep me')
    const tabs = page.getByRole('group', { name: 'QR' })
    await tabs.getByRole('button', { name: 'Read' }).click()
    await tabs.getByRole('button', { name: 'Make' }).click()
    await expect(page.getByLabel('Content for the QR code')).toHaveValue('keep me')
  })
})
