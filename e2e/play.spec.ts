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
    // Guesses sent faster than the room's 400 ms rate limit are queued and
    // delivered in order, never rejected and lost.
    for (const guess of ['zqxone', 'zqxtwo', term]) {
      await input.fill(guess)
      await input.press('Enter')
      await expect(input).toHaveValue('')
    }

    await expect(mina.getByTestId('solved-banner')).toContainText('You got it!')
    await expect(ari.getByTestId('guess-feed')).toContainText('zqxone')
    await expect(ari.getByTestId('guess-feed')).toContainText('zqxtwo')
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

test('the host’s custom words stay hidden from everyone else', async ({
  browser,
}) => {
  const ari = await newPlayer(browser)
  const mina = await newPlayer(browser)
  const words = [
    'kite',
    'lighthouse',
    'snowman',
    'cactus',
    'volcano',
    'pirate ship',
    'banana',
    'rocket',
  ]
  try {
    const code = await createRoomFromHome(ari, 'Create a room')
    await joinRoom(ari, 'Ari', 'Sun')
    const area = ari.getByLabel('Custom words')
    await area.fill(words.join(', '))
    await area.blur()
    await ari.getByRole('switch', { name: /Use only my words/ }).click()
    await expect(
      ari.getByRole('switch', { name: /Use only my words/ }),
    ).toHaveAttribute('aria-checked', 'true')

    await mina.goto(`/play/${code}`)
    await joinRoom(mina, 'Mina', 'Moon')
    // Mina learns how many words there are, never which.
    await expect(mina.getByTestId('custom-word-count')).toHaveText(
      /8 custom words/,
    )
    const minaText = await mina.locator('body').innerText()
    for (const word of words) expect(minaText).not.toContain(word)

    // Eight words cannot cover six rounds without repeats: everyone is told.
    await expect(mina.getByTestId('repeat-warning')).toContainText(
      'from round 2',
    )
    await chooseSetting(ari, 'Rounds', '2')
    await chooseSetting(ari, 'Swaps per drawer', '0')
    await expect(mina.getByTestId('repeat-warning')).toHaveCount(0)
    await expect(
      mina.getByText('Words drawn in this room never come back.'),
    ).toBeVisible()

    // Showing opponents the cards switches off the guessers' own-word clues.
    await expect(mina.getByTestId('clues-off')).toHaveCount(0)
    await chooseSetting(ari, 'Opponents see the draft', 'Cards + swaps')
    await expect(mina.getByTestId('clues-off')).toBeVisible()
  } finally {
    await ari.context().close()
    await mina.context().close()
  }
})

test('tagged custom words draft like rated cards, and a missed pick is explained', async ({
  page,
}) => {
  await createRoomFromHome(page, 'Practice with bots')
  await joinRoom(page, 'Ari')
  const area = page.getByLabel('Custom words')
  await area.fill(
    [
      'kite|easy',
      'sock|easy',
      'drum|easy',
      'submarine | HARD',
      'telescope|hard',
      'chandelier|hard',
      'pizza night',
      'road trip',
      'snow day',
      'typo|huge',
    ].join('\n'),
  )
  await expect(page.getByText('1 entry skipped')).toBeVisible()
  await area.blur()
  await page.getByRole('switch', { name: /Use only my words/ }).click()
  await expect(
    page.getByRole('switch', { name: /Use only my words/ }),
  ).toHaveAttribute('aria-checked', 'true')
  await chooseSetting(page, 'Rounds', '2')
  await expect(page.getByTestId('lobby-start')).toBeEnabled({ timeout: 15_000 })
  await page.getByTestId('lobby-start').click()

  // Ari joined before the bots, so Ari drafts for Sun: one easy, one
  // untagged ("Custom", scored like medium) and one hard card, and no
  // "What's this?" because the host's words have no definitions.
  const cards = page.getByTestId('draft-card')
  await expect(cards).toHaveCount(3, { timeout: PHASE_TIMEOUT })
  await expect(cards.filter({ hasText: 'Easy' })).toHaveCount(1)
  await expect(cards.filter({ hasText: '+40 pts' })).toHaveCount(1)
  await expect(cards.filter({ hasText: '+20 pts' })).toContainText('Custom')
  await expect(cards.filter({ hasText: 'Medium' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'What’s this?' })).toHaveCount(
    0,
  )
  await expect(
    page.getByText('These are the host’s own words', { exact: false }),
  ).toBeVisible()

  // Let the draft clock run out: the room picks, and says so.
  await expect(
    page.getByRole('status').filter({ hasText: 'Time’s up! We picked' }),
  ).toBeVisible({ timeout: PHASE_TIMEOUT })
  await expect(page.getByTestId('auto-picked-note')).toHaveText(
    'Time ran out, so we picked this card for you.',
  )
  await expect(page.getByRole('button', { name: 'What’s this?' })).toHaveCount(
    0,
  )
})

test('a drawer who leaves mid-draft hands the pick over, and the teammate is told why', async ({
  browser,
}) => {
  const max = await newPlayer(browser)
  const ben = await newPlayer(browser)
  try {
    const code = await createRoomFromHome(max, 'Create a room')
    await joinRoom(max, 'Max', 'Sun')
    await ben.goto(`/play/${code}`)
    await joinRoom(ben, 'Ben', 'Sun')
    await addBots(max, 'Moon', 2)
    await ben.getByTestId('lobby-ready').click()
    await expect(max.getByTestId('lobby-start')).toBeEnabled({
      timeout: 15_000,
    })
    await max.getByTestId('lobby-start').click()

    // Max joined first, so Max drafts for Sun; then Max leaves.
    await expect(max.getByTestId('draft-card').first()).toBeVisible({
      timeout: PHASE_TIMEOUT,
    })
    await expect(ben.getByText(/Max is picking your word/)).toBeVisible()
    await max.getByRole('button', { name: 'Leave room' }).first().click()
    await max
      .getByRole('dialog')
      .getByRole('button', { name: 'Leave room' })
      .click()

    // Ben gets the same draft, with a notice explaining the switch.
    await expect(ben.getByTestId('draft-card').first()).toBeVisible()
    await expect(
      ben.getByRole('status').filter({ hasText: 'Max left the room.' }),
    ).toContainText('You’re picking your team’s word now.')
  } finally {
    await max.context().close()
    await ben.context().close()
  }
})

test('a player the host removes sees the removed screen and can join again', async ({
  browser,
}) => {
  const ari = await newPlayer(browser)
  const theo = await newPlayer(browser)
  try {
    const code = await createRoomFromHome(ari, 'Create a room')
    await joinRoom(ari, 'Ari', 'Sun')
    await theo.goto(`/play/${code}`)
    await joinRoom(theo, 'Theo', 'Moon')
    await expect(
      ari.getByRole('list', { name: 'Moon players' }).getByText('Theo'),
    ).toBeVisible()

    await ari.getByRole('button', { name: 'Remove Theo' }).click()
    await expect(
      ari.getByRole('list', { name: 'Moon players' }).getByText('Theo'),
    ).toHaveCount(0)

    // Close 4003: a terminal screen, not a reconnect loop.
    await expect(
      theo.getByRole('heading', { name: 'You’re not in this room anymore' }),
    ).toBeVisible()
    await expect(theo.getByText('The host removed you')).toBeVisible()
    await expect(theo.getByText('Reconnecting')).toHaveCount(0)

    await theo.getByRole('button', { name: 'Join again' }).click()
    await joinRoom(theo, 'Theo')
    await expect(
      ari.getByRole('list', { name: /players$/ }).getByText('Theo'),
    ).toBeVisible()
  } finally {
    await ari.context().close()
    await theo.context().close()
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
