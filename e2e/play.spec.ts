import { expect, test, type Browser, type Page } from '@playwright/test'

/**
 * The live match screen against the real room server (wrangler on 8788)
 * and the Next dev server (3100), both started by playwright.config.ts.
 */

const PHASE_TIMEOUT = 90_000

type TeamName = 'Sun' | 'Moon'

test.describe.configure({ timeout: 240_000 })

test('practice: one player plays a round with bots from the home page', async ({
  page,
}) => {
  await createRoomFromHome(page, 'Practice with bots')
  await joinRoom(page, 'Ari')

  // Practice adds one teammate bot and two opponents, exactly once.
  const bots = page.locator('[data-testid="lobby-member"][data-kind="bot"]')
  await expect(bots).toHaveCount(3, { timeout: 15_000 })
  await expect(page).not.toHaveURL(/practice=1/)

  // Short match, set through the host's settings panel.
  await chooseSetting(page, 'Rounds', '2')
  await chooseSetting(page, 'Drawing time', '45s')
  await expect(page.getByTestId('lobby-start')).toBeEnabled()
  await page.getByTestId('lobby-start').click()

  // Round 1: act according to whichever role the room gave us.
  await playRound(page)
  await expectRoundResults(page)

  // The host may skip ahead; round 2 hands the pen to the other teammate.
  const next = page.getByRole('button', { name: 'Next round' })
  if (await next.isVisible())
    await next.click({ timeout: 5_000 }).catch(() => {})
  await playRound(page)
})

test('two players on one team: the guesser solves the drawer’s word', async ({
  browser,
}) => {
  const ari = await newPlayer(browser)
  const mina = await newPlayer(browser)
  try {
    const code = await createRoomFromHome(ari, 'Create a room')
    await joinRoom(ari, 'Ari', 'Sun')

    await mina.goto(`/play/${code}`)
    await joinRoom(mina, 'Mina', 'Sun')
    await expect(
      ari.getByRole('list', { name: 'Sun players' }).getByText('Mina'),
    ).toBeVisible()

    await addBots(ari, 'Moon', 2)
    await mina.getByTestId('lobby-ready').click()
    await expect(ari.getByTestId('lobby-start')).toBeEnabled({
      timeout: 15_000,
    })
    await ari.getByTestId('lobby-start').click()

    // Ari joined first, so Ari draws for Sun in round 1.
    await expect(mina.getByText(/Ari is picking your word/)).toBeVisible({
      timeout: PHASE_TIMEOUT,
    })
    await pickFirstCard(ari)
    const term = await waitForDrawing(ari)
    expect(term.length).toBeGreaterThan(0)
    // The guesser never sees the word.
    await expect(mina.getByTestId('drawer-word')).toHaveCount(0)

    await drawStrokes(ari, 2)
    // Ink shows on the drawer's paper and streams to the teammate's.
    await expect.poll(() => inkedPixels(ari)).toBeGreaterThan(0)
    await expect.poll(() => inkedPixels(mina)).toBeGreaterThan(0)
    const input = mina.getByLabel('Your guess')
    await expect(input).toBeEnabled({ timeout: PHASE_TIMEOUT })
    await input.fill(term)
    await input.press('Enter')

    await expect(mina.getByTestId('solved-banner')).toContainText('You got it!')
    await expect(ari.getByTestId('solved-banner')).toContainText(
      'Mina guessed it!',
    )
    await expect(ari.getByTestId('guess-feed')).toContainText(
      'Mina guessed it!',
    )
  } finally {
    await ari.context().close()
    await mina.context().close()
  }
})

/* --------------------------------- steps ---------------------------------- */

async function newPlayer(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  })
  return context.newPage()
}

async function createRoomFromHome(
  page: Page,
  kind: 'Create a room' | 'Practice with bots',
): Promise<string> {
  await page.goto('/')
  await page.getByRole('button', { name: kind }).click()
  await page.waitForURL(/\/play\/[A-Z0-9]{4,8}/, { timeout: 30_000 })
  const match = /\/play\/([A-Z0-9]{4,8})/.exec(page.url())
  if (!match?.[1]) throw new Error(`No room code in ${page.url()}`)
  return match[1]
}

async function joinRoom(page: Page, name: string, team?: TeamName) {
  await expect(
    page.getByRole('heading', { name: 'Join the room' }),
  ).toBeVisible({ timeout: 30_000 })
  await page.getByLabel('Your name').fill(name)
  if (team) await page.getByRole('radio', { name: team }).check({ force: true })
  await page.getByRole('button', { name: 'Join room' }).click()
  await expect(page.getByTestId('room-code')).toBeVisible({ timeout: 30_000 })
}

async function chooseSetting(page: Page, group: string, choice: string) {
  const radio = page
    .getByRole('radiogroup', { name: group })
    .getByRole('radio', { name: choice, exact: true })
  await radio.click()
  await expect(radio).toHaveAttribute('aria-checked', 'true')
}

async function addBots(page: Page, team: TeamName, count: number) {
  const button = page.getByRole('button', { name: `Add bot to ${team}` })
  const bots = page.locator('[data-testid="lobby-member"][data-kind="bot"]')
  for (let index = 0; index < count; index += 1) {
    const before = await bots.count()
    await button.click()
    await expect(bots).toHaveCount(before + 1)
  }
}

async function pickFirstCard(page: Page) {
  const card = page.getByTestId('draft-card').first()
  await expect(card).toBeVisible({ timeout: PHASE_TIMEOUT })
  await card.getByRole('button', { name: /^Pick / }).click()
}

/** Waits for the drawing phase as the drawer; returns the secret word. */
async function waitForDrawing(page: Page): Promise<string> {
  await expect(
    page.getByRole('toolbar', { name: 'Drawing tools' }),
  ).toBeVisible({ timeout: PHASE_TIMEOUT })
  return (await page.getByTestId('drawer-word').innerText()).trim()
}

async function drawStrokes(page: Page, count: number) {
  const canvas = page.getByTestId('team-canvas').locator('canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('The canvas has no size')
  for (let stroke = 0; stroke < count; stroke += 1) {
    const y = box.y + box.height * (0.25 + stroke * 0.12)
    await page.mouse.move(box.x + box.width * 0.2, y)
    await page.mouse.down()
    for (let step = 1; step <= 8; step += 1) {
      await page.mouse.move(
        box.x + box.width * (0.2 + step * 0.07),
        y + step * 3,
      )
    }
    await page.mouse.up()
  }
}

/** Drawer: pick a card and draw. Guesser: a wrong guess, keyboard checks. */
async function playRound(page: Page) {
  const card = page.getByTestId('draft-card').first()
  const waiting = page.getByText(/is picking your word/)
  await expect(card.or(waiting)).toBeVisible({ timeout: PHASE_TIMEOUT })

  if (await card.isVisible()) {
    await pickFirstCard(page)
    await waitForDrawing(page)
    // Bot teammates only guess once the drawer has a few strokes down.
    await drawStrokes(page, 4)
    return
  }
  await submitWrongGuess(page)
}

async function submitWrongGuess(page: Page) {
  const input = page.getByLabel('Your guess')
  await expect(input).toBeEnabled({ timeout: PHASE_TIMEOUT })
  const canvas = page.getByTestId('team-canvas').locator('canvas')
  const before = await canvas.boundingBox()
  await input.click()
  await input.fill('zqxjv')
  await input.press('Enter')
  await expect(
    page.getByTestId('guess-dock').getByRole('status'),
  ).toContainText('zqxjv')
  await expect(input).toBeFocused()
  await expect(input).toHaveValue('')
  const after = await canvas.boundingBox()
  expect(before).not.toBeNull()
  expect(after).not.toBeNull()
  expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThanOrEqual(4)
  expect(
    Math.abs((after?.width ?? 0) - (before?.width ?? 0)),
  ).toBeLessThanOrEqual(4)
  expect(await documentScroll(page)).toBe(0)
}

async function expectRoundResults(page: Page) {
  await expect(page.getByTestId('round-winner')).toBeVisible({
    timeout: PHASE_TIMEOUT,
  })
  await expect(page.getByTestId('result-word')).toHaveCount(2)
  const scores = page.getByTestId('results-scores')
  await expect(scores).toContainText('Sun')
  await expect(scores).toContainText(/\d/)
  await expect(page.getByTestId('top-scores')).toBeVisible()
}

/** Painted, non-white pixels on the main team canvas. */
async function inkedPixels(page: Page): Promise<number> {
  return page
    .getByTestId('team-canvas')
    .locator('canvas')
    .evaluate((node) => {
      if (!(node instanceof HTMLCanvasElement)) return 0
      const context = node.getContext('2d')
      if (!context) return 0
      const { data } = context.getImageData(0, 0, node.width, node.height)
      let count = 0
      for (let index = 0; index < data.length; index += 4) {
        const alpha = data[index + 3] ?? 0
        const red = data[index] ?? 255
        if (alpha > 0 && red < 128) count += 1
      }
      return count
    })
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
