import { expect, test } from '@playwright/test'
import { TOOL_IDS } from './helpers'

test.describe('routing', () => {
  test('/ goes to a language home; a bare tool path gets the language prefix', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/en\/$/)
    await page.goto('/totp')
    await expect(page).toHaveURL(/\/en\/totp$/)
    await expect(page.locator('article .tool-head h1')).toHaveText('TOTP codes')
  })

  test('unknown tool shows a not-found page with a way home', async ({ page }) => {
    await page.goto('/en/nope')
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
    await page.getByRole('link', { name: 'Back to home', exact: true }).click()
    await expect(page).toHaveURL(/\/en\/$/)
  })

  test('home lists every tool, numbered from 01 without gaps', async ({ page }) => {
    await page.goto('/en/')
    expect(TOOL_IDS).toHaveLength(17)
    await expect(page.locator('.contents a')).toHaveCount(TOOL_IDS.length)
    await expect(page.locator('.contents .no')).toHaveText(TOOL_IDS.map((_, i) => String(i + 1).padStart(2, '0')))
    await expect(page.locator('.index a .no').first()).toHaveText('01')
    await expect(page.locator('.index a .no').last()).toHaveText('17')
    await expect(page.locator('a[href$="/myip"]')).toHaveCount(0)
    await expect(page.locator('.contents .tag.hi')).toHaveCount(1) // only the site inspector needs the server
  })
})

test.describe('chrome', () => {
  test('switching language keeps the tool and updates <html lang>', async ({ page }) => {
    await page.goto('/en/totp')
    await page.getByLabel('Language').selectOption('es')
    await expect(page).toHaveURL(/\/es\/totp$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'es')
    await expect(page.locator('article .tool-head h1')).toHaveText('Códigos TOTP')
    await page.reload()
    await page.goto('/')
    await expect(page).toHaveURL(/\/es\/$/) // the choice is remembered
  })

  test('search filters the contents; Enter opens the first match; Ctrl+K focuses it', async ({ page }) => {
    await page.goto('/en/')
    const search = page.getByRole('searchbox', { name: 'Search tools' })
    await page.keyboard.press('Control+k')
    await expect(search).toBeFocused()
    await search.fill('jwt')
    await expect(page.locator('.index a')).toHaveCount(1)
    await search.press('Enter')
    await expect(page).toHaveURL(/\/en\/jwt$/)
    await search.fill('zzzzqq')
    await expect(page.getByText('No matching tool.')).toBeVisible()
  })

  test('TOTP carries a boxed "2FA" label in the contents, and searching "2fa" finds it', async ({ page }) => {
    await page.goto('/zh-TW/')
    const nav = page.getByRole('navigation', { name: '目錄' })
    const totp = nav.getByRole('link', { name: /TOTP 驗證碼/ })
    const badge = totp.locator('.index-badge')
    await expect(badge).toHaveText('2FA')
    await expect(badge).toHaveCSS('border-top-style', 'solid')
    await expect(nav.locator('.index-badge')).toHaveCount(1) // only tools that declare a badge get one
    // the box follows the link colour, so it stays readable on the highlighted current item
    await totp.click()
    const color = await badge.evaluate((el) => getComputedStyle(el).color)
    expect(await badge.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe(color)
    await page.getByRole('searchbox', { name: '搜尋工具' }).fill('2fa')
    await expect(nav.getByRole('link')).toHaveCount(1)
    await expect(nav.getByRole('link')).toContainText('TOTP')
  })

  test('theme cycles system → day → night and is remembered', async ({ page }) => {
    await page.goto('/en/')
    const theme = page.getByRole('button', { name: /^Theme:/ })
    await expect(theme).toHaveText('System')
    await theme.click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await theme.click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(21, 23, 27)')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark') // applied before first paint
    await page.getByRole('button', { name: /^Theme:/ }).click()
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/)
  })

  test('follows the system dark preference when nothing is saved', async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: 'dark' })
    const page = await ctx.newPage()
    await page.goto('http://127.0.0.1:' + (process.env.E2E_PORT ?? 8932) + '/en/')
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(21, 23, 27)')
    await ctx.close()
  })

  test('skip link is the first tab stop and moves focus to the content', async ({ page }) => {
    await page.goto('/en/json')
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to main content' })
    await expect(skip).toBeFocused()
    await expect(skip).toBeInViewport()
    await page.keyboard.press('Enter')
    await expect(page.locator('main')).toBeFocused()
  })
})

test.describe('phone layout', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('contents open from a button, close after choosing, and nothing overflows sideways', async ({ page }) => {
    await page.goto('/en/')
    const nav = page.getByRole('navigation', { name: 'Contents' })
    await expect(nav).toBeHidden()
    const menu = page.getByRole('button', { name: 'Contents' })
    await menu.click()
    await expect(menu).toHaveAttribute('aria-expanded', 'true')
    await expect(nav).toBeVisible()
    await nav.getByRole('link', { name: 'JSON formatter' }).click()
    await expect(page).toHaveURL(/\/en\/json$/)
    await expect(nav).toBeHidden()
    for (const path of ['/en/', '/en/json', '/en/hash', '/en/time', '/ja/site']) {
      await page.goto(path)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(overflow, path).toBe(false)
    }
  })

  test('typing fields are at least 16px, so iOS does not zoom in on focus', async ({ page }) => {
    for (const path of ['/en/json', '/en/totp', '/en/regex', '/en/urlua']) {
      await page.goto(path)
      const small = await page.evaluate(() =>
        Array.from(
          document.querySelectorAll(
            'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]), textarea, select',
          ),
        )
          .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
          .map((el) => el.outerHTML.slice(0, 80)),
      )
      expect(small, path).toEqual([])
    }
  })
})

test.describe('narrowest phone', () => {
  test.use({ viewport: { width: 320, height: 640 } })

  test('the masthead keeps wordmark and all three controls on one line in every language', async ({ page }) => {
    for (const lang of ['zh-TW', 'en', 'zh-CN', 'es', 'ja']) {
      await page.goto(`/${lang}/`)
      const tops = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.wordmark, .mast-tools > *')).map((el) =>
          Math.round(el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2),
        ),
      )
      expect(tops, lang).toHaveLength(4)
      expect(Math.max(...tops) - Math.min(...tops), lang).toBeLessThanOrEqual(4)
    }
    // the short label sits over a real select, which still switches language
    await page.getByLabel('言語').selectOption('en')
    await expect(page).toHaveURL(/\/en\/$/)
    await expect(page.locator('.lang-pick .short')).toBeVisible()
    await expect(page.locator('.lang-pick .short')).toHaveText('EN')
  })
})
