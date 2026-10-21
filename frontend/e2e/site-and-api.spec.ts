import { expect, test, type Page } from '@playwright/test'
import { open } from './helpers'

const REPORT = {
  target: { url: 'https://example.com/', host: 'example.com', port: 443 },
  dns: { addresses: ['104.20.23.154'], cname_chain: ['d1.cloudfront.net'], ns: ['bob.ns.cloudflare.com'] },
  ips: [
    { ip: '104.20.23.154', asn: 13335, as_name: 'CLOUDFLARENET', prefix: '104.20.0.0/14', country: 'US', ptr: null },
  ],
  http: {
    hops: [
      { url: 'http://example.com/', ip: '104.20.23.154', status: 301, http_version: 'HTTP/1.1' },
      { url: 'https://example.com/', ip: '104.20.23.154', status: 200, http_version: 'HTTP/1.1' },
    ],
    final_status: 200,
    headers: { server: 'cloudflare', 'cf-ray': 'abc-TPE' },
    cookie_names: ['__cf_bm'],
    server_software: ['server: cloudflare'],
    security_headers: { 'strict-transport-security': true, 'content-security-policy': false },
  },
  tls: {
    verified: true,
    protocol: 'TLSv1.3',
    cipher: 'TLS_AES_256_GCM_SHA384',
    subject: 'example.com',
    issuer: 'Test CA',
    not_after: 'Dec 25 2026',
    days_left: 69,
  },
  detections: [
    { name: 'Cloudflare', kind: 'cdn', confidence: 'high', evidence: ['header cf-ray', 'ASN CLOUDFLARENET'] },
    { name: 'Cloudflare DNS', kind: 'dns', confidence: 'medium', evidence: ['NS bob.ns.cloudflare.com'] },
  ],
  notes: [],
  elapsed_ms: 123,
}

async function inspect(page: Page, url: string) {
  await page.getByLabel('URL', { exact: true }).fill(url)
  await page.getByRole('button', { name: 'Inspect' }).click()
}

test.describe('Site inspector UI (API mocked — no real network)', () => {
  test.beforeEach(({ page }) => open(page, 'site'))

  test('shows detections, addresses, DNS, redirect path, security headers and the certificate', async ({ page }) => {
    let body: unknown
    await page.route('**/api/inspect', async (route) => {
      body = route.request().postDataJSON()
      await route.fulfill({ json: REPORT })
    })
    await expect(page.getByText('sends the URL you enter to our server')).toBeVisible()
    await inspect(page, 'example.com')
    expect(body).toEqual({ url: 'example.com' })
    await expect(page.getByRole('heading', { name: 'Detected services' })).toBeVisible()
    await expect(page.locator('tbody tr', { hasText: 'Cloudflare' }).first()).toContainText('CDN')
    await expect(page.getByText('AS13335 · CLOUDFLARENET (US)')).toBeVisible()
    await expect(page.getByText('d1.cloudfront.net')).toBeVisible()
    await expect(page.locator('.kv').filter({ hasText: 'Redirect path' })).toContainText('301 http://example.com/')
    await expect(page.getByText('strict-transport-security: present')).toBeVisible()
    await expect(page.getByText('content-security-policy: missing')).toBeVisible()
    await expect(page.getByText('Test CA')).toBeVisible()
    await expect(page.getByText('69 days left')).toBeVisible()
    await expect(page.getByText('Took 123 ms')).toBeVisible()
  })

  const cases: [string, number, object, string][] = [
    [
      'private address',
      400,
      { code: 'private_address', message: 'x' },
      'isn’t a public internet address'.replace('’', "'"),
    ],
    ['bad scheme', 400, { code: 'bad_scheme' }, 'Only http and https'],
    ['bad port', 400, { code: 'bad_port' }, 'Only ports 80 and 443'],
    ['dns failure', 400, { code: 'dns_failed' }, "couldn't be found"],
    ['rate limit', 429, { code: 'rate_limited', retry_after: 42 }, 'Try again in 42s'],
    ['busy', 503, { code: 'busy', retry_after: 1 }, 'busy'],
    ['server error', 502, { code: 'inspect_failed' }, 'The inspection failed'],
    ['unknown error code', 400, { code: 'something_new' }, 'The inspection failed'],
  ]
  for (const [name, status, json, text] of cases) {
    test(`explains: ${name}`, async ({ page }) => {
      await page.route('**/api/inspect', (route) => route.fulfill({ status, json }))
      await inspect(page, 'whatever.example.com')
      await expect(page.getByRole('alert')).toContainText(text)
    })
  }

  test('explains an unreachable server and can be retried', async ({ page }) => {
    await page.route('**/api/inspect', (route) => route.abort())
    await inspect(page, 'example.com')
    await expect(page.getByRole('alert')).toContainText("Couldn't reach the server")
    await page.unroute('**/api/inspect')
    await page.route('**/api/inspect', (route) => route.fulfill({ json: REPORT }))
    await page.getByRole('button', { name: 'Inspect' }).click()
    await expect(page.getByRole('heading', { name: 'Detected services' })).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('the button is disabled while empty and while a request is running', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Inspect' })
    await expect(button).toBeDisabled()
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    await page.route('**/api/inspect', async (route) => {
      await gate
      await route.fulfill({ json: REPORT })
    })
    await page.getByLabel('URL', { exact: true }).fill('example.com')
    await button.click()
    await expect(page.getByRole('button', { name: 'Inspecting…' })).toBeDisabled()
    release()
    await expect(page.getByRole('heading', { name: 'Detected services' })).toBeVisible()
  })

  test('when the server is busy it queues the visitor and retries by itself', async ({ page }) => {
    let calls = 0
    await page.route('**/api/inspect', (route) => {
      calls++
      return calls < 3
        ? route.fulfill({ status: 503, json: { code: 'busy', retry_after: 1 } })
        : route.fulfill({ json: REPORT })
    })
    await inspect(page, 'example.com')
    await expect(page.getByRole('button', { name: 'Waiting in line…' })).toBeDisabled()
    await expect(page.getByText('You are in the queue')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Detected services' })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('You are in the queue')).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect(calls).toBe(3) // one try + two automatic retries, no button presses
  })

  test('gives up politely when it stays busy', async ({ page }) => {
    let calls = 0
    await page.route('**/api/inspect', (route) => {
      calls++
      return route.fulfill({ status: 503, json: { code: 'busy', retry_after: 1 } })
    })
    await inspect(page, 'example.com')
    await expect(page.getByRole('alert')).toContainText('busy', { timeout: 10_000 })
    expect(calls).toBe(3)
    await expect(page.getByRole('button', { name: 'Inspect' })).toBeEnabled() // can try again by hand
  })

  test('leaving the page stops the retries', async ({ page }) => {
    let calls = 0
    await page.route('**/api/inspect', (route) => {
      calls++
      return route.fulfill({ status: 503, json: { code: 'busy', retry_after: 1 } })
    })
    await inspect(page, 'example.com')
    await expect(page.getByText('You are in the queue')).toBeVisible()
    await page.getByRole('link', { name: 'JSON formatter' }).click()
    await page.waitForTimeout(2500)
    expect(calls).toBe(1)
  })

  test('says when an answer came from the cache', async ({ page }) => {
    await page.route('**/api/inspect', (route) => route.fulfill({ json: { ...REPORT, cached_age_s: 12 } }))
    await inspect(page, 'example.com')
    await expect(page.getByText('cached result from 12s ago')).toBeVisible()
  })

  test('says so when nothing is recognised', async ({ page }) => {
    await page.route('**/api/inspect', (route) => route.fulfill({ json: { ...REPORT, detections: [] } }))
    await inspect(page, 'example.com')
    await expect(page.getByText('No known CDN, WAF or cloud provider')).toBeVisible()
  })
})

test('LIVE: a real site is identified (needs internet; run with E2E_LIVE=1)', async ({ page }) => {
  test.skip(!process.env.E2E_LIVE, 'set E2E_LIVE=1 to run against the real network')
  await open(page, 'site')
  await inspect(page, 'http://github.com')
  await expect(page.getByRole('heading', { name: 'Detected services' })).toBeVisible({ timeout: 25_000 })
  await expect(page.locator('.kv').filter({ hasText: 'Redirect path' })).toContainText('https://github.com/')
  await expect(page.getByRole('heading', { name: 'TLS certificate' })).toBeVisible()
})

test.describe('backend API (real server, nothing leaves the machine)', () => {
  const SSRF: [string, string][] = [
    ['http://127.0.0.1/', 'private_address'],
    ['http://[::1]/', 'private_address'],
    ['http://[::ffff:7f00:1]/', 'private_address'],
    ['http://169.254.169.254/latest/meta-data/', 'private_address'],
    ['http://10.0.0.1/', 'private_address'],
    ['http://192.168.1.1/', 'private_address'],
    ['http://100.64.0.1/', 'private_address'],
    ['http://127.1/', 'bad_host'],
    ['http://0x7f.0.0.1/', 'bad_host'],
    ['http://2130706433/', 'bad_host'],
    ['http://localhost/', 'bad_host'],
    ['http://metadata.google.internal/', 'bad_host'],
    ['http://printer.local/', 'bad_host'],
    ['http://user:pw@example.com/', 'credentials'],
    ['file:///etc/passwd', 'bad_scheme'],
    ['gopher://example.com/', 'bad_scheme'],
    ['https://example.com:22/', 'bad_port'],
    ['https://example.com:8443/', 'bad_port'],
  ]
  for (const [url, code] of SSRF) {
    test(`refuses ${url}`, async ({ request }) => {
      const r = await request.post('/api/inspect', { data: { url } })
      expect(r.status()).toBe(400)
      expect((await r.json()).code).toBe(code)
    })
  }

  test('the removed IP/proxy endpoint is gone and docs are not exposed', async ({ request }) => {
    expect((await request.get('/api/myip')).status()).toBe(404)
    expect((await request.get('/docs')).headers()['content-type']).toContain('text/html') // SPA page, not Swagger
    expect(await (await request.get('/docs')).text()).not.toContain('swagger')
    expect((await request.get('/openapi.json')).headers()['content-type']).toContain('text/html')
  })

  test('security headers on API and pages; static assets are cached forever', async ({ request, page }) => {
    for (const path of ['/api/health', '/en/']) {
      const h = (await request.get(path)).headers()
      expect(h['content-security-policy']).toContain("default-src 'self'")
      expect(h['content-security-policy']).toContain("frame-ancestors 'none'")
      expect(h['x-content-type-options']).toBe('nosniff')
      expect(h['referrer-policy']).toBe('no-referrer')
      expect(h['permissions-policy']).toContain('camera=()')
    }
    expect((await request.get('/api/health')).headers()['cache-control']).toBe('no-store')
    await page.goto('/en/')
    const css = await page.locator('link[rel=stylesheet]').first().getAttribute('href')
    expect((await request.get(css!)).headers()['cache-control']).toContain('immutable')
  })

  test('no CSP violations or console errors on any tool page', async ({ page }) => {
    const problems: string[] = []
    page.on('console', (m) => m.type() === 'error' && problems.push(m.text()))
    page.on('pageerror', (e) => problems.push(String(e)))
    for (const id of [
      'image',
      'json',
      'convert',
      'encode',
      'qr',
      'totp',
      'password',
      'hash',
      'jwt',
      'time',
      'regex',
      'markdown',
      'urlua',
      'site',
    ]) {
      await page.goto(`/zh-TW/${id}`)
      await expect(page.locator('article .tool-head h1')).toBeVisible()
    }
    await page.goto('/ja/')
    await page.goto('/zh-CN/')
    expect(problems).toEqual([])
  })

  test('SPA fallback serves the app for deep links but never files outside the build', async ({ request }) => {
    expect((await request.get('/en/does-not-exist')).status()).toBe(200)
    expect((await request.get('/assets/nope.js')).status()).toBe(404)
    expect((await request.get('/api/nope')).status()).toBe(404)
    for (const evil of [
      '/..%2f..%2fbackend/app/main.py',
      '/%2e%2e/%2e%2e/backend/app/main.py',
      '/..\\..\\backend\\app\\main.py',
    ]) {
      const body = await (await request.get(evil)).text()
      expect(body, evil).not.toContain('def create_app')
    }
  })
})
