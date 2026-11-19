import { expect, test, type Page } from '@playwright/test'

/**
 * Phone keyboard stability on the live match screen: while drawing is on,
 * focusing the guess input and submitting a wrong guess must not move the
 * canvas or scroll the document. The host plays from a desktop context.
 */

const PHASE_TIMEOUT = 90_000

test.describe.configure({ timeout: 180_000 })

test('phone guesser: typing and submitting keeps the canvas anchored', async ({
  page,
  browser,
}) => {
  const hostContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  })
  const host = await hostContext.newPage()
  try {
    await host.goto('/')
    await host.getByRole('button', { name: 'Create a room' }).click()
    await host.waitForURL(/\/play\/[A-Z0-9]{4,8}/, { timeout: 30_000 })
    const code = /\/play\/([A-Z0-9]{4,8})/.exec(host.url())?.[1]
    if (!code) throw new Error(`No room code in ${host.url()}`)
    await join(host, 'Ari')

    await page.goto(`/play/${code}`)
    await join(page, 'Mina')
    await expect(
      host.getByRole('list', { name: 'Sun players' }).getByText('Mina'),
    ).toBeVisible()

    const addMoonBot = host.getByRole('button', { name: 'Add bot to Moon' })
    const bots = host.locator('[data-testid="lobby-member"][data-kind="bot"]')
    await addMoonBot.click()
    await expect(bots).toHaveCount(1)
    await addMoonBot.click()
    await expect(bots).toHaveCount(2)

    await page.getByTestId('lobby-ready').click()
    await expect(host.getByTestId('lobby-start')).toBeEnabled({
      timeout: 15_000,
    })
    await host.getByTestId('lobby-start').click()

    const card = host.getByTestId('draft-card').first()
    await expect(card).toBeVisible({ timeout: PHASE_TIMEOUT })
    await card.getByRole('button', { name: /^Pick / }).click()

    const input = page.getByLabel('Your guess')
    await expect(input).toBeEnabled({ timeout: PHASE_TIMEOUT })
    const canvas = page.getByTestId('team-canvas').locator('canvas')
    await expect(canvas).toBeVisible()
    const before = await canvas.boundingBox()

    await input.click()
    await expect(input).toBeFocused()
    await input.fill('zqxjv')
    await input.press('Enter')
    await expect(
      page.getByTestId('guess-dock').getByRole('status'),
    ).toContainText('zqxjv')
    await expect(input).toBeFocused()

    const after = await canvas.boundingBox()
    expect(before).not.toBeNull()
    expect(after).not.toBeNull()
    expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThanOrEqual(4)
    expect(
      Math.abs((after?.width ?? 0) - (before?.width ?? 0)),
    ).toBeLessThanOrEqual(4)
    expect(await documentScroll(page)).toBe(0)

    // Typing again still works without moving anything.
    await input.fill('again')
    await expect(input).toHaveValue('again')
    expect(await documentScroll(page)).toBe(0)
  } finally {
    await hostContext.close()
  }
})

async function join(page: Page, name: string) {
  await expect(
    page.getByRole('heading', { name: 'Join the room' }),
  ).toBeVisible({ timeout: 30_000 })
  await page.getByLabel('Your name').fill(name)
  await page.getByRole('radio', { name: 'Sun' }).check({ force: true })
  await page.getByRole('button', { name: 'Join room' }).click()
  await expect(page.getByTestId('room-code')).toBeVisible({ timeout: 30_000 })
}

async function documentScroll(page: Page): Promise<number> {
  return page.evaluate(() =>
    Math.max(
      window.scrollY,
      document.scrollingElement?.scrollTop ?? 0,
      document.documentElement.scrollTop,
      document.body.scrollTop,
    ),
  )
}
