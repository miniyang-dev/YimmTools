import { expect, test } from '@playwright/test'
import { LANGS, TOOL_IDS, toolText } from './helpers'

// A translation key that leaked to the screen looks like "tool.json.name", "errParts" or "level_H".
const RAW_KEY = /^(?:[a-z]+\.[a-zA-Z]+(?:\.[a-zA-Z]+)?|(?:err|note|kind|conf|level)[A-Z_]\w*)$/

test('every language has a name and description for every tool', () => {
  for (const lang of LANGS) {
    for (const id of TOOL_IDS) {
      expect(toolText(lang, id, 'name'), `${lang}:${id}`).toBeTruthy()
      expect(toolText(lang, id, 'desc'), `${lang}:${id}`).toBeTruthy()
    }
  }
})

for (const lang of LANGS) {
  test.describe(`language ${lang}`, () => {
    for (const id of TOOL_IDS) {
      test(`${id}: localised heading, no leaked keys, no sideways scroll`, async ({ page }) => {
        await page.goto(`/${lang}/${id}`)
        await expect(page.locator('article .tool-head h1')).toHaveText(toolText(lang, id, 'name'))
        await expect(page.locator('html')).toHaveAttribute('lang', lang)
        await expect(page).toHaveTitle(
          new RegExp(`${toolText(lang, id, 'name').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} — YimmTool`),
        )

        const texts = await page.locator('body *:not(script):not(style)').evaluateAll((els) =>
          els.flatMap((el) =>
            Array.from(el.childNodes)
              .filter((n) => n.nodeType === Node.TEXT_NODE)
              .map((n) => (n.textContent ?? '').trim())
              .filter(Boolean),
          ),
        )
        expect(texts.filter((t) => RAW_KEY.test(t))).toEqual([])
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        )
        expect(overflow).toBe(false)
      })
    }
  })
}

test('Simplified Chinese really is Simplified (generated from zh-TW)', async ({ page }) => {
  await page.goto('/zh-CN/hash')
  await expect(page.locator('article .tool-head h1')).toHaveText('Hash／HMAC')
  await page.goto('/zh-CN/image')
  await expect(page.locator('article .tool-head h1')).toHaveText('图片压缩与转换')
  await page.goto('/zh-CN/convert')
  await expect(page.getByLabel('输入', { exact: true })).toBeVisible()
})
