import { devices, expect, test, type Page } from '@playwright/test'

/**
 * No zoom on focus: iOS Safari zooms the page into any text field smaller
 * than 16px. On a touch phone every field a player or host types into must
 * be at least 16px: the home page, accounts, the Word Library (linked from
 * the lobby), and the room's join gate and lobby. Runs in Chromium with an
 * iPhone profile (touch, coarse pointer), which is what the size rule keys
 * on.
 */

const { defaultBrowserType: _browserType, ...iPhone } = devices['iPhone 13']
test.use({ ...iPhone })

/** Text-entry fields (checkboxes and the like do not zoom). */
async function smallFields(page: Page) {
  return page.evaluate(() => {
    const exempt = new Set([
      'checkbox',
      'radio',
      'range',
      'color',
      'file',
      'hidden',
      'button',
      'submit',
      'reset',
      'image',
    ])
    return [...document.querySelectorAll('input, select, textarea')]
      .filter(
        (element) =>
          !(element instanceof HTMLInputElement && exempt.has(element.type)),
      )
      .map((element) => ({
        field:
          element.id ||
          element.getAttribute('name') ||
          element.getAttribute('aria-label') ||
          element.tagName,
        fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
      }))
      .filter((entry) => entry.fontSize < 16)
  })
}

async function fieldCount(page: Page) {
  return page.locator('input, select, textarea').count()
}

test('every text field is at least 16px on a phone', async ({ page }) => {
  for (const path of ['/', '/account', '/admin/words']) {
    await page.goto(path)
    await expect(page.locator('input, textarea').first()).toBeVisible({
      timeout: 30_000,
    })
    expect(await fieldCount(page)).toBeGreaterThan(0)
    expect(await smallFields(page), path).toEqual([])
  }

  // The Word Library's every form (add a word, edit, bulk JSON import).
  await page.goto('/admin/words')
  await page.getByLabel('New custom collection').fill('Phones')
  await page.getByRole('button', { name: 'Create collection' }).click()
  await expect(
    page.getByRole('heading', { name: 'Phones', exact: true }),
  ).toBeVisible()
  expect(await smallFields(page), '/admin/words collection').toEqual([])

  // The room: join gate, then the host's lobby (custom words).
  await page.goto('/')
  await page.getByRole('button', { name: 'Create a room' }).click()
  await page.waitForURL(/\/play\/[A-Z0-9]{4,8}/, { timeout: 30_000 })
  await expect(page.getByLabel('Your name')).toBeVisible({ timeout: 30_000 })
  expect(await smallFields(page), 'join gate').toEqual([])
  await page.getByLabel('Your name').fill('Mina')
  await page.getByRole('button', { name: 'Join room' }).click()
  await expect(page.getByLabel('Custom words')).toBeVisible({
    timeout: 30_000,
  })
  expect(await smallFields(page), 'lobby').toEqual([])
})
