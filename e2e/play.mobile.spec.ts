import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test'

/**
 * Phone behavior on the live match screen:
 * - keyboard stability: focusing the guess input and submitting a wrong
 *   guess must not move the canvas or scroll the document;
 * - on an iPhone-sized screen the guesser's drawing stays large while the
 *   compact keyboard is up, every draft card fits, and every drawing tool is
 *   on screen (portrait and landscape);
 * - pinching the game surface never zooms the page.
 * Teammates play from a desktop context.
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

test.describe('iPhone-sized screen (390 x 664)', () => {
  test.use({ viewport: { width: 390, height: 664 } })

  // These run against `next dev`, as the owner does when playing from a
  // phone. Nothing (such as the Next dev indicator) may cover the keys.

  test('guesser: the drawing stays large while the compact keyboard is up', async ({
    page,
    browser,
  }) => {
    const host = await desktopPlayer(browser)
    try {
      const code = await createRoom(host.page)
      await join(host.page, 'Ari')
      await page.goto(`/play/${code}`)
      await join(page, 'Mina')
      await startWithMoonBots(host.page, page)

      // Ari joined first, so Ari draws and Mina guesses on the phone.
      await pickFirstCard(host.page)
      const input = page.getByLabel('Your guess')
      await expect(input).toBeEnabled({ timeout: PHASE_TIMEOUT })

      // Touch phones default to the in-app keyboard.
      const keyboard = page.getByRole('group', { name: 'Compact keyboard' })
      await expect(keyboard).toBeVisible()
      const canvas = page.getByTestId('team-canvas').locator('canvas')
      const before = await boxOf(canvas)
      const keys = await boxOf(keyboard)
      expect(before.width).toBeGreaterThanOrEqual(250)
      expect(before.y + before.height).toBeLessThanOrEqual(keys.y)

      // Type and send with the in-app keys: nothing moves, focus stays.
      for (const key of ['z', 'q', 'x']) {
        await page.getByRole('button', { name: key, exact: true }).tap()
      }
      await expect(input).toHaveValue('zqx')

      // Backspace sits in the bottom-left corner, where `next dev` used to
      // pin its indicator: a tap at its centre must reach the key.
      const backspace = keyboard.getByRole('button', { name: 'Backspace' })
      const centre = await boxOf(backspace)
      const hit = await page.evaluate(
        ([x, y]) =>
          document
            .elementFromPoint(x, y)
            ?.closest('button')
            ?.getAttribute('aria-label') ?? null,
        [centre.x + centre.width / 2, centre.y + centre.height / 2],
      )
      expect(hit).toBe('Backspace')
      await page.touchscreen.tap(
        centre.x + centre.width / 2,
        centre.y + centre.height / 2,
      )
      await expect(input).toHaveValue('zq')
      await page.getByRole('button', { name: 'x', exact: true }).tap()
      await expect(input).toHaveValue('zqx')

      await page.getByRole('button', { name: 'Send', exact: true }).tap()
      await expect(
        page.getByTestId('guess-dock').getByRole('status'),
      ).toContainText('zqx')
      await expect(input).toBeFocused()
      const after = await boxOf(canvas)
      expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(4)
      expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(4)
      expect(await documentScroll(page)).toBe(0)

      // The keys can be tucked away; tapping the input brings them back.
      await page.getByRole('button', { name: 'Hide keyboard' }).tap()
      await expect(keyboard).toBeHidden()
      expect((await boxOf(canvas)).width).toBeGreaterThanOrEqual(250)
      await input.tap()
      await expect(keyboard).toBeVisible()

      // Switching to the phone's own keyboard keeps a usable input.
      await page.getByRole('button', { name: 'Use phone keyboard' }).tap()
      await expect(keyboard).toBeHidden()
      await expect(input).toHaveAttribute('inputmode', 'text')
      await page.getByRole('button', { name: 'Use compact keyboard' }).tap()
      await expect(keyboard).toBeVisible()

      // Big enough to tap: 40 px controls; letter keys 40 px tall and as
      // wide as ten to a row allows (like the phone's own keyboard).
      for (const name of ['Use phone keyboard', 'Send guess', 'Send']) {
        const box = await boxOf(page.getByRole('button', { name, exact: true }))
        expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(40)
      }
      const portraitKey = await boxOf(
        keyboard.getByRole('button', { name: 'q', exact: true }),
      )
      expect(portraitKey.height).toBeGreaterThanOrEqual(40)
      expect(portraitKey.width).toBeGreaterThanOrEqual(30)

      // Landscape: the guess sidebar takes the width the paper does not
      // need, so the keys stay phone-sized and the paper keeps its size.
      for (const [width, height, minKey] of [
        [667, 375, 29],
        [844, 390, 34],
      ] as const) {
        await page.setViewportSize({ width, height })
        await expect(page.getByTestId('play-layout')).toHaveAttribute(
          'data-layout',
          'wide-short',
        )
        await expect(keyboard).toBeVisible()
        const key = await boxOf(
          keyboard.getByRole('button', { name: 'q', exact: true }),
        )
        expect(key.width).toBeGreaterThanOrEqual(minKey)
        expect(key.height).toBeGreaterThanOrEqual(40)
        const paper = await boxOf(canvas)
        expect(paper.height).toBeGreaterThanOrEqual(200)
        await expectOnScreen(
          page,
          keyboard.getByRole('button', { name: 'Send' }),
        )
      }
    } finally {
      await host.context.close()
    }
  })

  test('drawer: every draft card and every drawing tool fits on screen', async ({
    page,
    browser,
  }) => {
    const mate = await desktopPlayer(browser)
    try {
      // The phone joins first, so it picks and draws in round 1.
      const code = await createRoom(page)
      await join(page, 'Mina')
      await mate.page.goto(`/play/${code}`)
      await join(mate.page, 'Ari')
      await startWithMoonBots(page, mate.page)

      const cards = page.getByTestId('draft-card')
      await expect(cards.first()).toBeVisible({ timeout: PHASE_TIMEOUT })
      const count = await cards.count()
      expect(count).toBeGreaterThanOrEqual(3)
      for (let index = 0; index < count; index += 1) {
        const card = cards.nth(index)
        await expectOnScreen(page, card)
        // Difficulty and bonus are part of every card, at a glance.
        await expect(card).toContainText(/Easy|Medium|Hard/)
        await expect(card).toContainText(/\+\d+ pts|No bonus/)
      }

      await cards
        .first()
        .getByRole('button', { name: /^Pick / })
        .tap()
      const toolbar = page.getByRole('toolbar', { name: 'Drawing tools' })
      await expect(toolbar).toBeVisible({ timeout: PHASE_TIMEOUT })
      await expectAllToolsOnScreen(page, toolbar)

      // Sizes open from the size button and stay reachable.
      await toolbar.getByRole('button', { name: /^Stroke size/ }).tap()
      await page.getByRole('button', { name: 'Huge stroke' }).tap()
      await expect(
        toolbar.getByRole('button', { name: 'Stroke size: Huge' }),
      ).toBeVisible()

      // Landscape phone: nothing floats over the paper, so its corners
      // draw, and the tools are still all on screen.
      await page.setViewportSize({ width: 667, height: 375 })
      await expect(page.getByTestId('play-layout')).toHaveAttribute(
        'data-layout',
        'wide-short',
      )
      await expectAllToolsOnScreen(page, toolbar)
      const paper = await boxOf(
        page.getByTestId('team-canvas').locator('canvas'),
      )
      expect(paper.height).toBeGreaterThanOrEqual(200)
      for (const [fx, fy] of [
        [0.95, 0.05],
        [0.05, 0.05],
        [0.95, 0.95],
      ] as const) {
        const owner = await page.evaluate(
          ([x, y]) =>
            document
              .elementFromPoint(x, y)
              ?.closest('[data-testid]')
              ?.getAttribute('data-testid') ?? null,
          [paper.x + paper.width * fx, paper.y + paper.height * fy],
        )
        expect(owner).toBe('team-canvas')
      }
    } finally {
      await mate.context.close()
    }
  })
})

test('pinching the play screen never zooms the page', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Synthetic pinches need CDP')
  const cdp = await page.context().newCDPSession(page)
  const pinchOut = async (target: Locator) => {
    const box = await boxOf(target)
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: x - 20, y, id: 1 },
        { x: x + 20, y, id: 2 },
      ],
    })
    for (let step = 1; step <= 8; step += 1) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          { x: x - 20 - step * 12, y, id: 1 },
          { x: x + 20 + step * 12, y, id: 2 },
        ],
      })
    }
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    })
    await page.waitForTimeout(300)
  }
  const zoom = () =>
    page.evaluate(() => ({
      scale: window.visualViewport?.scale ?? 1,
      pinnedToFullHeight:
        (document.querySelector<HTMLElement>('[data-game-viewport]')
          ?.offsetHeight ?? 0) >=
        window.innerHeight - 1,
    }))

  await createRoom(page)
  await pinchOut(page.getByRole('heading', { name: 'Join the room' }))
  expect(await zoom()).toEqual({ scale: 1, pinnedToFullHeight: true })

  await join(page, 'Mina')
  await pinchOut(page.getByTestId('room-code'))
  expect(await zoom()).toEqual({ scale: 1, pinnedToFullHeight: true })
})

interface DesktopPlayer {
  readonly context: BrowserContext
  readonly page: Page
}

async function desktopPlayer(browser: Browser): Promise<DesktopPlayer> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  })
  return { context, page: await context.newPage() }
}

async function createRoom(page: Page): Promise<string> {
  await page.goto('/')
  await page.getByRole('button', { name: 'Create a room' }).click()
  await page.waitForURL(/\/play\/[A-Z0-9]{4,8}/, { timeout: 30_000 })
  const code = /\/play\/([A-Z0-9]{4,8})/.exec(page.url())?.[1]
  if (!code) throw new Error(`No room code in ${page.url()}`)
  return code
}

/** Two Moon bots, the guest readies up, and the host starts the match. */
async function startWithMoonBots(host: Page, guest: Page) {
  const addMoonBot = host.getByRole('button', { name: 'Add bot to Moon' })
  const bots = host.locator('[data-testid="lobby-member"][data-kind="bot"]')
  await addMoonBot.click()
  await expect(bots).toHaveCount(1)
  await addMoonBot.click()
  await expect(bots).toHaveCount(2)
  await guest.getByTestId('lobby-ready').click()
  await expect(host.getByTestId('lobby-start')).toBeEnabled({
    timeout: 15_000,
  })
  await host.getByTestId('lobby-start').click()
}

async function pickFirstCard(page: Page) {
  const card = page.getByTestId('draft-card').first()
  await expect(card).toBeVisible({ timeout: PHASE_TIMEOUT })
  await card.getByRole('button', { name: /^Pick / }).click()
}

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Element has no box')
  return box
}

async function expectOnScreen(page: Page, locator: Locator) {
  const box = await boxOf(locator)
  const viewport = page.viewportSize()
  if (!viewport) throw new Error('No viewport')
  expect(box.x).toBeGreaterThanOrEqual(-1)
  expect(box.y).toBeGreaterThanOrEqual(-1)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1)
}

/** No hidden sideways scroll: every tool and color is visible at once. */
async function expectAllToolsOnScreen(page: Page, toolbar: Locator) {
  const overflow = await toolbar.evaluate(
    (element) => element.scrollWidth - element.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(1)
  for (const name of [
    /^Pen/,
    /^Eraser/,
    /^Stroke size/,
    /^Undo/,
    /^Redo/,
    /Clear canvas/,
  ]) {
    await expectOnScreen(page, toolbar.getByRole('button', { name }))
  }
  const colors = toolbar
    .getByRole('group', { name: 'Ink color' })
    .getByRole('button')
  expect(await colors.count()).toBe(12)
  for (const color of await colors.all()) await expectOnScreen(page, color)
}

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
