import { expect, test, type Page } from '@playwright/test'
import { RFC_SECRET, RFC_SECRET_B32, b64url, open, out, totpNode } from './helpers'

const readout = (page: Page) => page.locator('.readout')
const digitsOnly = async (page: Page) => (await readout(page).innerText()).replace(/\s/g, '')

test.describe('TOTP', () => {
  test.beforeEach(async ({ page }) => {
    // Pin the browser clock to the RFC 6238 test time (T = 59 s) so the expected codes are fixed.
    await page.clock.install({ time: 58_000 })
    await open(page, 'totp')
    await page.clock.pauseAt(59_000)
  })

  test('matches the RFC 6238 vectors; spaces, dashes and lower case in the secret are fine', async ({ page }) => {
    await page.getByLabel('Secret (Base32)').fill(RFC_SECRET_B32.toLowerCase().replace(/(.{4})/g, '$1 - '))
    await expect(readout(page)).toHaveText('287 082') // RFC: 94287082 → last 6 digits
    await page.getByLabel('Digits').selectOption('8')
    await expect(readout(page)).toHaveText('9428 7082')
    expect(await digitsOnly(page)).toBe(totpNode(RFC_SECRET, 59, { digits: 8 }))
  })

  test('supports SHA-256/512 and a 60 s period', async ({ page }) => {
    await page.getByLabel('Secret (Base32)').fill(RFC_SECRET_B32)
    await page.getByLabel('Algorithm').selectOption('SHA-256')
    await page.getByLabel('Period (s)').selectOption('60')
    await expect.poll(() => digitsOnly(page)).toBe(totpNode(RFC_SECRET, 59, { algo: 'sha256', period: 60 }))
    await page.getByLabel('Algorithm').selectOption('SHA-512')
    await expect.poll(() => digitsOnly(page)).toBe(totpNode(RFC_SECRET, 59, { algo: 'sha512', period: 60 }))
  })

  test('shows the next code and rolls over exactly at the period boundary', async ({ page }) => {
    await page.getByLabel('Secret (Base32)').fill(RFC_SECRET_B32)
    await expect(readout(page)).toHaveText('287 082')
    const next = totpNode(RFC_SECRET, 60)
    await expect(page.getByText(/Next/)).toContainText(`${next.slice(0, 3)} ${next.slice(3)}`)
    await expect(page.locator('[role=timer]')).toHaveText('Refreshes in 1s')
    await page.clock.runFor(2_000) // t = 61 s
    await expect.poll(() => digitsOnly(page)).toBe(next)
  })

  test('the countdown bar tracks the time left', async ({ page }) => {
    await page.getByLabel('Secret (Base32)').fill(RFC_SECRET_B32)
    const bar = page.locator('.countdown i')
    await expect(bar).toHaveAttribute('style', /scaleX\(0\.0(3|4)\d*\)/) // 1 s of 30 s left
    await page.clock.runFor(2_000)
    await expect(bar).toHaveAttribute('style', /scaleX\(0\.9\d*\)/)
  })

  test('otpauth:// links fill in digits, algorithm, period and show issuer/account', async ({ page }) => {
    await page
      .getByLabel('Secret (Base32)')
      .fill(
        `otpauth://totp/Acme:bob@example.com?secret=${RFC_SECRET_B32}&issuer=Acme&digits=8&algorithm=SHA256&period=60`,
      )
    await expect(page.getByLabel('Secret (Base32)')).toHaveValue(RFC_SECRET_B32)
    await expect(page.getByLabel('Digits')).toHaveValue('8')
    await expect(page.getByLabel('Algorithm')).toHaveValue('SHA-256')
    await expect(page.getByLabel('Period (s)')).toHaveValue('60')
    await expect.poll(() => digitsOnly(page)).toBe(totpNode(RFC_SECRET, 59, { algo: 'sha256', digits: 8, period: 60 }))
    await expect(page.locator('.kv')).toContainText('Acme')
    await expect(page.locator('.kv')).toContainText('bob@example.com')
  })

  test('imports a secret from a QR image', async ({ page }) => {
    // build a QR of an otpauth link with the app's own QR tool, then feed the picture to TOTP
    await open(page, 'qr')
    await page.getByLabel('Content for the QR code').fill(`otpauth://totp/Acme:bob?secret=${RFC_SECRET_B32}&digits=8`)
    const png = await page.locator('.qr-box canvas').screenshot()
    await open(page, 'totp')
    await page.locator('input[type=file]').setInputFiles({ name: 'otp.png', mimeType: 'image/png', buffer: png })
    await expect(page.getByLabel('Secret (Base32)')).toHaveValue(RFC_SECRET_B32)
    await expect(page.getByLabel('Digits')).toHaveValue('8')
    // a QR image that is not an otpauth link is refused
    await open(page, 'qr')
    await page.getByLabel('Content for the QR code').fill('https://example.com')
    const other = await page.locator('.qr-box canvas').screenshot()
    await open(page, 'totp')
    await page.locator('input[type=file]').setInputFiles({ name: 'x.png', mimeType: 'image/png', buffer: other })
    await expect(page.getByRole('alert')).toContainText('No otpauth QR code')
  })

  test('rejects invalid secrets, warns about short ones, never stores the secret', async ({ page }) => {
    const secret = page.getByLabel('Secret (Base32)')
    await secret.fill('zzz!!')
    await expect(page.getByRole('alert')).toContainText('valid Base32')
    await expect(readout(page)).toHaveCount(0)
    await secret.fill('JBSWY3DP')
    await expect(page.getByRole('status').filter({ hasText: 'short' })).toBeVisible()
    await page.getByRole('button', { name: 'Use a sample secret' }).click()
    await expect(secret).toHaveValue('JBSWY3DPEHPK3PXP')
    const stored = await page.evaluate(
      () => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }),
    )
    expect(stored).not.toContain('JBSWY3DP')
    await page.getByRole('button', { name: 'Clear' }).click()
    await expect(secret).toHaveValue('')
  })
})

test.describe('Password & UUID', () => {
  test.beforeEach(({ page }) => open(page, 'password'))
  const items = (page: Page) => page.locator('article ul li code')

  test('length, count and character classes are honoured', async ({ page }) => {
    await expect(items(page)).toHaveCount(5)
    for (const t of await items(page).allInnerTexts()) expect(t).toHaveLength(20)
    await page.locator('input[type=range]').fill('40')
    for (const t of await items(page).allInnerTexts()) expect(t).toHaveLength(40)
    await page.getByLabel('Count').selectOption('20')
    await expect(items(page)).toHaveCount(20)
    for (const name of ['Lowercase a–z', 'Uppercase A–Z', 'Symbols !@#…']) await page.getByLabel(name).uncheck()
    for (const t of await items(page).allInnerTexts()) expect(t).toMatch(/^\d{40}$/)
    await page.getByLabel('Digits 0–9').uncheck()
    await expect(page.getByRole('alert')).toContainText('at least one')
  })

  test('can avoid look-alike characters and regenerates on demand', async ({ page }) => {
    await page.getByLabel(/Avoid look-alikes/).check()
    for (const t of await items(page).allInnerTexts()) expect(t).not.toMatch(/[O0oIl1|`'"]/)
    const first = await items(page).first().innerText()
    await page.getByRole('button', { name: 'Regenerate' }).click()
    expect(await items(page).first().innerText()).not.toBe(first)
    await expect(page.getByText(/bits of entropy/)).toBeVisible()
  })

  test('UUID v4 / v7 formats, case and hyphens', async ({ page }) => {
    await page.getByRole('group', { name: 'mode' }).getByRole('button', { name: 'UUID' }).click()
    for (const t of await items(page).allInnerTexts())
      expect(t).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    await page.getByRole('button', { name: /v7/ }).click()
    for (const t of await items(page).allInnerTexts())
      expect(t).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    await page.getByLabel('Uppercase').check()
    await page.getByLabel('Hyphens').uncheck()
    for (const t of await items(page).allInnerTexts()) expect(t).toMatch(/^[0-9A-F]{32}$/)
  })

  test('copy puts the exact password on the clipboard', async ({ page }) => {
    const first = await items(page).first().innerText()
    await page.locator('article ul li').first().getByRole('button', { name: 'Copy' }).click()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(first)
  })
})

test.describe('Hash & HMAC', () => {
  test.beforeEach(({ page }) => open(page, 'hash'))
  const cell = (page: Page, algo: string) =>
    page
      .locator('tbody tr')
      .filter({ has: page.getByRole('rowheader', { name: algo, exact: true }) })
      .locator('code')
  const FOX = 'The quick brown fox jumps over the lazy dog'

  test('plain digests match published vectors', async ({ page }) => {
    await page.getByLabel('Text', { exact: true }).fill(FOX)
    await expect(cell(page, 'MD5')).toHaveText('9e107d9d372bb6826bd81d3542a419d6')
    await expect(cell(page, 'SHA-1')).toHaveText('2fd4e1c67a2d28fced849ee1bb76e7391b93eb12')
    await expect(cell(page, 'SHA-256')).toHaveText('d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592')
  })

  test('HMAC with a key, base64 and upper-case output', async ({ page }) => {
    await page.getByLabel('Text', { exact: true }).fill(FOX)
    await page.getByLabel(/HMAC key/).fill('key')
    await expect(cell(page, 'SHA-256')).toHaveText('f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8')
    await expect(cell(page, 'MD5')).toHaveText('80070713463e7749b90c2dc24911e275')
    await expect(cell(page, 'SHA-1')).toHaveText('de7c9b85b8b78aa6bc8a7a36f70a90701c9db4d9')
    await page.getByRole('button', { name: 'Base64', exact: true }).click()
    await expect(cell(page, 'SHA-256')).toHaveText('97yD9DBThCSxMpjmqm+xQ+9NWaFJRhdZl0edvC0aPNg=')
    await page.getByRole('button', { name: 'Hex' }).click()
    await page.getByLabel('Uppercase').check()
    await expect(cell(page, 'MD5')).toHaveText('80070713463E7749B90C2DC24911E275')
  })

  test('hashes a file (and the text box is disabled meanwhile)', async ({ page }) => {
    await page
      .locator('input[type=file]')
      .setInputFiles({ name: 'abc.txt', mimeType: 'text/plain', buffer: Buffer.from('abc') })
    await expect(cell(page, 'MD5')).toHaveText('900150983cd24fb0d6963f7d28e17f72')
    await expect(page.getByLabel('Text', { exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Clear' }).click()
    await expect(page.getByLabel('Text', { exact: true })).toBeEnabled()
  })

  test('switching the display format does not recompute the hashes', async ({ page }) => {
    await page.getByLabel('Text', { exact: true }).fill(FOX)
    await expect(cell(page, 'MD5')).toBeVisible()
    await page.evaluate(() => {
      const sign = crypto.subtle.sign.bind(crypto.subtle)
      const digest = crypto.subtle.digest.bind(crypto.subtle)
      ;(window as unknown as { __calls: number }).__calls = 0
      crypto.subtle.sign = (...a: Parameters<typeof sign>) => (
        (window as unknown as { __calls: number }).__calls++,
        sign(...a)
      )
      crypto.subtle.digest = (...a: Parameters<typeof digest>) => (
        (window as unknown as { __calls: number }).__calls++,
        digest(...a)
      )
    })
    await page.getByRole('button', { name: 'Base64', exact: true }).click()
    await page.getByRole('button', { name: 'Hex' }).click()
    await page.getByLabel('Uppercase').check()
    await expect(cell(page, 'MD5')).toHaveText('9E107D9D372BB6826BD81D3542A419D6')
    expect(await page.evaluate(() => (window as unknown as { __calls: number }).__calls)).toBe(0)
  })

  test('typing is debounced: one burst, one computation', async ({ page }) => {
    await page.getByLabel('Text', { exact: true }).fill('seed')
    await expect(cell(page, 'MD5')).toBeVisible()
    await page.evaluate(() => {
      const digest = crypto.subtle.digest.bind(crypto.subtle)
      ;(window as unknown as { __calls: number }).__calls = 0
      crypto.subtle.digest = (...a: Parameters<typeof digest>) => (
        (window as unknown as { __calls: number }).__calls++,
        digest(...a)
      )
    })
    await page.getByLabel('Text', { exact: true }).pressSequentially('0123456789', { delay: 10 })
    await expect(cell(page, 'SHA-1')).toHaveText(/^[0-9a-f]{40}$/)
    // 4 SHA digests per computation (MD5 is not WebCrypto); a burst of 10 keystrokes may be at most 2 computations
    expect(await page.evaluate(() => (window as unknown as { __calls: number }).__calls)).toBeLessThanOrEqual(8)
  })
})

test.describe('JWT decoder', () => {
  test.beforeEach(({ page }) => open(page, 'jwt'))
  const now = () => Math.floor(Date.now() / 1000)
  const token = (header: object, payload: object, sig = 'x') => `${b64url(header)}.${b64url(payload)}.${sig}`

  test('a long token wraps inside the box and still counts as one line', async ({ page }) => {
    const box = page.getByLabel('JWT', { exact: true })
    await box.fill(token({ alg: 'HS256' }, { data: 'x'.repeat(600) }))
    const numbers = page.locator('.code-gutter .code-numbers > div')
    await expect(numbers).toHaveCount(1)
    expect(await numbers.first().evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(44)
    const sideways = await box.evaluate((el) => el.scrollWidth > el.clientWidth)
    expect(sideways).toBe(false) // no horizontal scrolling for a token
  })

  test('decodes the canonical example', async ({ page }) => {
    await page
      .getByLabel('JWT', { exact: true })
      .fill(
        'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
      )
    await expect(out(page, 0)).toContainText('"alg": "HS256"')
    await expect(out(page, 1)).toContainText('"name": "John Doe"')
    await expect(page.locator('.tbl')).toContainText('iat')
    await expect(page.locator('.tbl')).toContainText('ago')
  })

  test('shows expiry in words: expired vs. still valid', async ({ page }) => {
    const box = page.getByLabel('JWT', { exact: true })
    await box.fill(token({ alg: 'HS256' }, { exp: now() - 3600 }))
    await expect(page.locator('.tbl')).toContainText('Expired 1 h ago')
    await box.fill(token({ alg: 'HS256' }, { exp: now() + 7200 }))
    await expect(page.locator('.tbl')).toContainText('Expires in 2 h')
    await box.fill(token({ alg: 'HS256' }, { nbf: now() + 600 }))
    await expect(page.locator('.tbl')).toContainText('Not valid yet')
  })

  test('verifies HS256 signatures with the right secret only', async ({ page }) => {
    const { createHmac } = await import('node:crypto')
    const h = b64url({ alg: 'HS256', typ: 'JWT' })
    const p = b64url({ sub: 'x' })
    const sig = createHmac('sha256', 's3cret').update(`${h}.${p}`).digest('base64url')
    await page.getByLabel('JWT', { exact: true }).fill(`${h}.${p}.${sig}`)
    await expect(page.getByRole('status').filter({ hasText: 'not been verified' })).toBeVisible()
    await page.getByLabel('Shared secret').fill('wrong')
    await expect(page.getByRole('alert')).toContainText('Signature mismatch')
    await page.getByLabel('Shared secret').fill('s3cret')
    await expect(page.getByRole('status').filter({ hasText: 'Signature is valid' })).toBeVisible()
  })

  test('warns about alg=none and explains unsupported algorithms', async ({ page }) => {
    const box = page.getByLabel('JWT', { exact: true })
    await box.fill(token({ alg: 'none' }, { a: 1 }, ''))
    await expect(page.getByRole('alert')).toContainText('no signature')
    await box.fill(token({ alg: 'RS256' }, { a: 1 }, 'abc'))
    await expect(page.getByText('RS256 needs a public key')).toBeVisible()
  })

  test('says which part is malformed', async ({ page }) => {
    const box = page.getByLabel('JWT', { exact: true })
    await box.fill('abc')
    await expect(page.getByRole('alert')).toContainText('three parts')
    await box.fill('@@.eyJhIjoxfQ.x')
    await expect(page.getByRole('alert')).toContainText('header')
    await box.fill('eyJhbGciOiJub25lIn0.@@.x')
    await expect(page.getByRole('alert')).toContainText('payload')
  })

  test('does not invent a signature check from a non-HMAC token', async ({ page }) => {
    await page.getByLabel('JWT', { exact: true }).fill(token({ alg: 'ES256' }, { a: 1 }))
    await expect(page.getByLabel('Shared secret')).toHaveCount(0)
  })
})
