import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test'

const ROOM_CODE = `E${Date.now().toString(36).slice(-6)}`.toUpperCase()
const ROLE_ROOM_CODE = `R${Date.now().toString(36).slice(-6)}`.toUpperCase()
const TAB_ROOM_CODE = `T${Date.now().toString(36).slice(-6)}`.toUpperCase()
const PARTICIPANTS = [
  'team-a-drawer',
  'team-a-guesser',
  'team-b-drawer',
  'team-b-guesser',
] as const

type ParticipantId = (typeof PARTICIPANTS)[number]

test.beforeEach(async ({ request }) => {
  const response = await request.post(`/api/playtest/rooms/${ROOM_CODE}`, {
    data: { action: 'reset' },
  })
  expect(response.ok()).toBe(true)
})

test('four isolated seats share room updates without leaking final words', async ({
  browser,
  request,
}, testInfo) => {
  const baseURL = testInfo.project.use.baseURL
  if (typeof baseURL !== 'string')
    throw new Error('Playwright baseURL is required')

  const contexts: BrowserContext[] = []
  const pages = {} as Record<ParticipantId, Page>

  try {
    for (const participantId of PARTICIPANTS) {
      const context = await browser.newContext()
      contexts.push(context)
      const page = await context.newPage()
      pages[participantId] = page
      await page.goto(
        `${baseURL}/games/dual-draw/room/${ROOM_CODE}?participant=${participantId}`,
      )
      await expect(page.getByTestId('drawing-stage')).toHaveAttribute(
        'data-realtime-status',
        'ready',
      )
    }

    const teamADrawer = pages['team-a-drawer']
    const teamAGuesser = pages['team-a-guesser']
    const teamBDrawer = pages['team-b-drawer']
    const teamBGuesser = pages['team-b-guesser']

    await expect(
      teamADrawer.getByRole('heading', { name: /Ari · Team Sun drawer/ }),
    ).toBeVisible()
    await expect(
      teamAGuesser.getByRole('heading', { name: /Mina · Team Sun guesser/ }),
    ).toBeVisible()
    await expect(
      teamBDrawer.getByRole('heading', { name: /Bo · Team Moon drawer/ }),
    ).toBeVisible()
    await expect(
      teamBGuesser.getByRole('heading', { name: /Theo · Team Moon guesser/ }),
    ).toBeVisible()

    await expect(teamADrawer.getByTestId('final-word')).toHaveText('lighthouse')
    await expect(teamBDrawer.getByTestId('final-word')).toHaveText('volcano')
    await expect(teamADrawer.getByText('volcano', { exact: true })).toHaveCount(
      0,
    )
    await expect(
      teamBDrawer.getByText('lighthouse', { exact: true }),
    ).toHaveCount(0)
    await expect(teamAGuesser.getByTestId('final-word')).toHaveCount(0)
    await expect(teamBGuesser.getByTestId('final-word')).toHaveCount(0)
    await expect(teamAGuesser.getByLabel('Your guess')).toBeVisible()
    await expect(teamBGuesser.getByLabel('Your guess')).toBeVisible()
    await expect(teamADrawer.getByLabel('Your guess')).toHaveCount(0)
    await expect(teamBDrawer.getByLabel('Your guess')).toHaveCount(0)

    const teamADrawerCanvas = teamADrawer.getByLabel('Team Sun drawing canvas')
    const teamAGuesserCanvas = teamAGuesser.getByLabel(
      'Team Sun drawing canvas',
    )
    const teamBGuesserCanvas = teamBGuesser.getByLabel(
      'Team Moon drawing canvas',
    )
    await expect(teamADrawerCanvas).toHaveAttribute('aria-disabled', 'false')
    await expect(teamAGuesserCanvas).toHaveAttribute('aria-disabled', 'true')

    const canvasBox = await teamADrawerCanvas.boundingBox()
    expect(canvasBox).not.toBeNull()
    if (!canvasBox) throw new Error('Drawer canvas must have dimensions')

    await teamADrawer.mouse.move(
      canvasBox.x + canvasBox.width * 0.2,
      canvasBox.y + canvasBox.height * 0.4,
    )
    await teamADrawer.mouse.down()
    await teamADrawer.mouse.move(
      canvasBox.x + canvasBox.width * 0.72,
      canvasBox.y + canvasBox.height * 0.62,
      { steps: 12 },
    )
    await teamADrawer.mouse.up()
    // Start another gesture without waiting for the first command receipt. A
    // delayed intermediate projection must not roll this tap back.
    await teamADrawer.mouse.click(
      canvasBox.x + canvasBox.width * 0.84,
      canvasBox.y + canvasBox.height * 0.24,
    )

    await expect
      .poll(() => getInkPixelCount(teamAGuesserCanvas))
      .toBeGreaterThan(0)
    await expect.poll(() => getInkPixelCount(teamBGuesserCanvas)).toBe(0)
    const twoGestureInk = await getInkPixelCount(teamAGuesserCanvas)

    // Undo and redo are server-authoritative semantic edits, not local-only
    // canvas tricks, so the teammate follows both changes.
    await teamADrawer.getByRole('button', { name: 'Undo' }).click()
    await expect
      .poll(() => getInkPixelCount(teamAGuesserCanvas))
      .toBeLessThan(twoGestureInk)
    await expect
      .poll(() => getInkPixelCount(teamAGuesserCanvas))
      .toBeGreaterThan(0)
    await teamADrawer.getByRole('button', { name: 'Undo' }).click()
    await expect.poll(() => getInkPixelCount(teamAGuesserCanvas)).toBe(0)
    await teamADrawer.getByRole('button', { name: 'Redo' }).click()
    await expect
      .poll(() => getInkPixelCount(teamAGuesserCanvas))
      .toBeGreaterThan(0)
    await teamADrawer.getByRole('button', { name: 'Redo' }).click()
    await expect
      .poll(() => getInkPixelCount(teamAGuesserCanvas))
      .toBe(twoGestureInk)

    await teamAGuesser.reload()
    await expect(teamAGuesser.getByTestId('drawing-stage')).toHaveAttribute(
      'data-realtime-status',
      'ready',
    )
    await expect
      .poll(() =>
        getInkPixelCount(teamAGuesser.getByLabel('Team Sun drawing canvas')),
      )
      .toBeGreaterThan(0)

    const guesserProjection = await request.get(
      `/api/playtest/rooms/${ROOM_CODE}?participant=team-a-guesser`,
    )
    const guesserPayload = await guesserProjection.text()
    expect(guesserPayload).not.toContain('lighthouse')
    expect(guesserPayload).not.toContain('volcano')

    const stageBefore = await teamAGuesser
      .getByTestId('drawing-stage')
      .boundingBox()
    await teamAGuesser.getByLabel('Your guess').fill('sailboat')
    await teamAGuesser.getByRole('button', { name: 'Guess' }).click()
    await expect(
      teamAGuesser.getByTestId('guess-composer').getByRole('status'),
    ).toHaveText('Not quite. Keep looking at the drawing.')
    await expect(
      teamADrawer.getByText('Mina guessed “sailboat”.'),
    ).toBeVisible()

    const stageAfter = await teamAGuesser
      .getByTestId('drawing-stage')
      .boundingBox()
    expect(stageBefore).not.toBeNull()
    expect(stageAfter).not.toBeNull()
    expect(
      Math.abs((stageAfter?.y ?? 0) - (stageBefore?.y ?? 0)),
    ).toBeLessThanOrEqual(1)
    expect(
      Math.abs((stageAfter?.height ?? 0) - (stageBefore?.height ?? 0)),
    ).toBeLessThanOrEqual(1)

    await teamAGuesser.getByLabel('Your guess').fill('lighthouse')
    await teamAGuesser.getByLabel('Your guess').press('Enter')
    await expect(
      teamAGuesser.getByTestId('guess-composer').getByRole('status'),
    ).toHaveText('Correct — your team solved it.')
    await expect(
      teamBDrawer.getByText('Mina solved it for their team.'),
    ).toBeVisible()
    await expect(
      teamAGuesser.getByText('lighthouse', { exact: true }),
    ).toHaveCount(0)
    await expect(
      teamBGuesser.getByText('lighthouse', { exact: true }),
    ).toHaveCount(0)

    // Team A solving does not cut Team B off. Its clock and scoring opportunity
    // remain live until Team B solves or the authoritative deadline expires.
    await expect(teamBGuesser.getByLabel('Your guess')).toBeEnabled()
    await teamBGuesser.getByLabel('Your guess').fill('volcano')
    await teamBGuesser.getByLabel('Your guess').press('Enter')
    await expect(
      teamBGuesser.getByTestId('guess-composer').getByRole('status'),
    ).toHaveText('Correct — your team solved it.')
    await expect(
      teamAGuesser.getByText('Theo solved it for their team.'),
    ).toBeVisible()

    await expect(
      teamAGuesser
        .getByRole('article', { name: 'Team Sun' })
        .getByText('800', { exact: true }),
    ).toBeVisible()
    await expect(
      teamBGuesser
        .getByRole('article', { name: 'Team Moon' })
        .getByText('730', { exact: true }),
    ).toBeVisible()
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
  }
})

test('server-assigned role controls the temporary word projection', async ({
  browser,
  request,
}, testInfo) => {
  const baseURL = testInfo.project.use.baseURL
  if (typeof baseURL !== 'string') {
    throw new Error('Playwright baseURL is required')
  }

  const reset = await request.post(`/api/playtest/rooms/${ROLE_ROOM_CODE}`, {
    data: { action: 'reset' },
  })
  expect(reset.ok()).toBe(true)

  const firstContext = await browser.newContext()
  const secondContext = await browser.newContext()
  try {
    // The first Team A session becomes the server drawer even though its URL
    // requested the fake guesser seat.
    const firstPage = await firstContext.newPage()
    await firstPage.goto(
      `${baseURL}/games/dual-draw/room/${ROLE_ROOM_CODE}?participant=team-a-guesser`,
    )
    await expect(firstPage.getByTestId('drawing-stage')).toHaveAttribute(
      'data-realtime-status',
      'ready',
    )
    await expect(firstPage.getByTestId('final-word')).toHaveText('lighthouse')
    await expect(firstPage.getByLabel('Your guess')).toHaveCount(0)

    // The later session is a server guesser. Its drawer-looking query string
    // must not cause the fake REST adapter to reveal the answer.
    const secondPage = await secondContext.newPage()
    await secondPage.goto(
      `${baseURL}/games/dual-draw/room/${ROLE_ROOM_CODE}?participant=team-a-drawer`,
    )
    await expect(secondPage.getByTestId('drawing-stage')).toHaveAttribute(
      'data-realtime-status',
      'ready',
    )
    await expect(secondPage.getByTestId('final-word')).toHaveCount(0)
    await expect(secondPage.getByTestId('word-length')).toHaveText('10 letters')
    await expect(secondPage.getByLabel('Your guess')).toBeVisible()
  } finally {
    await Promise.all([firstContext.close(), secondContext.close()])
  }
})

test('a newer same-seat tab supersedes the old transport without a reconnect fight', async ({
  context,
  page,
  request,
}) => {
  const reset = await request.post(`/api/playtest/rooms/${TAB_ROOM_CODE}`, {
    data: { action: 'reset' },
  })
  expect(reset.ok()).toBe(true)

  const roomUrl = `/games/dual-draw/room/${TAB_ROOM_CODE}?participant=team-a-drawer`
  await page.goto(roomUrl)
  await expect(page.getByTestId('drawing-stage')).toHaveAttribute(
    'data-realtime-status',
    'ready',
  )

  const newerPage = await context.newPage()
  await newerPage.goto(roomUrl)
  await expect(newerPage.getByTestId('drawing-stage')).toHaveAttribute(
    'data-realtime-status',
    'ready',
  )
  await expect(page.getByTestId('drawing-stage')).toHaveAttribute(
    'data-realtime-status',
    'unavailable',
  )
  await expect(
    page.getByTestId('drawing-stage').getByRole('status'),
  ).toContainText('active in another tab')
})

async function getInkPixelCount(canvas: Locator): Promise<number> {
  return canvas.evaluate((element) => {
    if (!(element instanceof HTMLCanvasElement)) {
      throw new Error('Expected a canvas element')
    }

    const context = element.getContext('2d')
    if (!context) throw new Error('Expected a 2D canvas context')
    const pixels = context.getImageData(
      0,
      0,
      element.width,
      element.height,
    ).data
    let ink = 0

    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index] ?? 255
      const green = pixels[index + 1] ?? 255
      const blue = pixels[index + 2] ?? 255
      if (red < 245 || green < 245 || blue < 245) ink += 1
    }

    return ink
  })
}
