import { expect, test, type Page } from '@playwright/test'
import { open, out } from './helpers'

const figure = (page: Page, label: string) =>
  page
    .locator('.figures > div')
    .filter({ has: page.locator('dt', { hasText: label }) })
    .locator('dd')
const kvValue = (page: Page, label: string) =>
  page.locator('.kv dt', { hasText: label }).locator('xpath=following-sibling::dd[1]')

test.describe('Word count & case', () => {
  test.beforeEach(({ page }) => open(page, 'text'))

  test('counts mixed Chinese and English the way editors do', async ({ page }) => {
    await page.getByLabel('Text', { exact: true }).fill('我用 iPhone 15 拍照。\n\nSecond paragraph 👍🏽')
    await expect(figure(page, 'Words')).toHaveText('8') // 我 用 拍 照 + iPhone 15 Second paragraph
    await expect(figure(page, 'Characters')).toHaveText('36')
    await expect(kvValue(page, 'CJK characters')).toHaveText('4')
    await expect(kvValue(page, 'Lines')).toHaveText('3')
    await expect(kvValue(page, 'Paragraphs')).toHaveText('2')
  })

  test('converts case, naming style and width, and can send the result back', async ({ page }) => {
    const box = page.getByLabel('Text', { exact: true })
    await box.fill('user profile id\nXMLHttpRequest')
    await expect(out(page)).toHaveText('USER PROFILE ID\nXMLHTTPREQUEST') // default: upper case
    await page.getByRole('button', { name: 'camelCase' }).click()
    await expect(out(page)).toHaveText('userProfileId\nxmlHttpRequest')
    await expect(page.getByRole('button', { name: 'camelCase' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'UPPER CASE' })).toHaveAttribute('aria-pressed', 'false')
    await page.getByRole('button', { name: 'snake_case' }).click()
    await expect(out(page)).toHaveText('user_profile_id\nxml_http_request')
    await box.fill('ＡＢＣ１２３！')
    await page.getByRole('button', { name: 'Half-width' }).click()
    await expect(out(page)).toHaveText('ABC123!')
    await page.getByRole('button', { name: '↑ Input' }).click()
    await expect(box).toHaveValue('ABC123!')
  })
})

test.describe('Chinese script converter', () => {
  test('Simplified → Taiwan Traditional with wording, marking what changed', async ({ page }) => {
    await open(page, 'zhconv', 'zh-TW')
    const box = page.getByLabel('原文')
    await box.fill('软件里的鼠标和内存')
    await expect(out(page)).toHaveText('軟體裡的滑鼠和記憶體')
    await expect(page.locator('pre.out mark.hit')).not.toHaveCount(0)
    await expect(page.getByText('改了 7 個字')).toBeVisible() // 的, 鼠 and 和 stay
    // characters only: wording stays as written
    await page.getByLabel('連用語一起轉換').uncheck()
    await expect(out(page)).toHaveText('軟件裡的鼠標和內存') // Taiwan writes 裡; 裏 is the Hong Kong form
  })

  test('Hong Kong and back to Simplified', async ({ page }) => {
    await open(page, 'zhconv', 'en')
    const box = page.getByLabel('Text', { exact: true })
    await box.fill('软件里的鼠标')
    await page.getByRole('button', { name: 'Traditional (Hong Kong)' }).click()
    await expect(out(page)).toHaveText('軟件裏的鼠標')
    await page.getByRole('button', { name: 'Simplified' }).click()
    await box.fill('軟體裡的滑鼠和資訊')
    await expect(out(page)).toHaveText('软件里的鼠标和信息')
  })

  test('the zh-CN page defaults to converting into Simplified', async ({ page }) => {
    await open(page, 'zhconv', 'zh-CN')
    await expect(page.getByRole('button', { name: '简体' })).toHaveAttribute('aria-pressed', 'true')
  })
})

test.describe('Color converter & contrast', () => {
  test.beforeEach(({ page }) => open(page, 'color'))
  const color = (page: Page) => page.getByLabel('Color', { exact: true })
  const formats = (page: Page) => page.locator('.formats code')

  test('converts any CSS colour to every notation', async ({ page }) => {
    await color(page).fill('rgb(255 0 0 / 50%)')
    await expect(formats(page)).toHaveText([
      '#ff000080',
      'rgba(255, 0, 0, 0.5)',
      'hsla(0, 100%, 50%, 0.5)',
      /^oklch\(62\.8% 0\.2577 29\.23 \/ 0\.5\)$/,
    ])
    await color(page).fill('tomato') // a named colour, resolved by the browser
    await expect(formats(page).first()).toHaveText('#ff6347')
    await color(page).fill('nonsense')
    await expect(page.getByRole('alert')).toContainText("isn't a color")
  })

  test('the native picker and the text field stay in sync', async ({ page }) => {
    await page.getByLabel('Color — picker').fill('#2c6a3f')
    await expect(color(page)).toHaveValue('#2c6a3f')
    await color(page).fill('hsl(210, 50%, 40%)')
    await expect(page.getByLabel('Color — picker')).toHaveValue('#336699')
  })

  test('grades contrast against WCAG and fixes a failing colour', async ({ page }) => {
    await color(page).fill('#777777')
    await page.getByLabel('Background', { exact: true }).fill('#ffffff')
    await expect(page.getByTestId('ratio')).toHaveText('4.47:1')
    const row = (name: string) =>
      page
        .locator('.tbl tr')
        .filter({ has: page.getByRole('cell', { name, exact: true }) })
        .locator('td')
        .last()
    await expect(row('AA · body text')).toHaveText('✗ Fail')
    await expect(row('AA · large text')).toHaveText('✓ Pass')
    await page.getByRole('button', { name: 'Use it' }).click()
    const fixed = await color(page).inputValue()
    expect(fixed).toMatch(/^#[0-9a-f]{6}$/)
    await expect(page.getByTestId('ratio')).toHaveText(/^4\.(5\d|6\d):1$/)
    await expect(row('AA · body text')).toHaveText('✓ Pass')
  })

  test('swap exchanges text and background', async ({ page }) => {
    await color(page).fill('#000000')
    await page.getByLabel('Background', { exact: true }).fill('#ffff00')
    await page.getByRole('button', { name: '⇄ Swap' }).click()
    await expect(color(page)).toHaveValue('#ffff00')
    await expect(page.getByLabel('Background', { exact: true })).toHaveValue('#000000')
    await expect(page.getByTestId('ratio')).toHaveText('19.55:1')
  })
})
