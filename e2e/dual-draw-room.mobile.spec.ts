import { expect, test, type Locator } from '@playwright/test'

const RUN_ID = Date.now().toString(36).slice(-6).toUpperCase()

function roomCodeFor(projectName: string) {
  const engine = projectName.includes('webkit') ? 'W' : 'C'
  return `M${engine}${RUN_ID}`
}

test.beforeEach(async ({ request }, testInfo) => {
  const response = await request.post(
    `/api/playtest/rooms/${roomCodeFor(testInfo.project.name)}`,
    {
      data: { action: 'reset' },
    },
  )
  expect(response.ok()).toBe(true)
})

test('mobile touch drawing syncs, reloads, and keeps guessing anchored', async ({
  context,
  page,
}, testInfo) => {
  const roomCode = roomCodeFor(testInfo.project.name)
  // Seed the authoritative team drawer first; role comes from room state, not
  // from a client-claimed query parameter.
  await page.goto(`/games/dual-draw/room/${roomCode}?participant=team-a-drawer`)
  await expect(page.getByTestId('drawing-stage')).toHaveAttribute(
    'data-realtime-status',
    'ready',
  )

  const guesserPage = await context.newPage()
  await guesserPage.goto(
    `/games/dual-draw/room/${roomCode}?participant=team-a-guesser`,
  )
  await expect(guesserPage.getByTestId('drawing-stage')).toHaveAttribute(
    'data-realtime-status',
    'ready',
  )
  const opponentDrawerPage = await context.newPage()
  await opponentDrawerPage.goto(
    `/games/dual-draw/room/${roomCode}?participant=team-b-drawer`,
  )
  await expect(opponentDrawerPage.getByTestId('drawing-stage')).toHaveAttribute(
    'data-realtime-status',
    'ready',
  )

  const drawerCanvas = page.getByLabel('Team Sun drawing canvas')
  const guesserCanvas = guesserPage.getByLabel('Team Sun drawing canvas')
  await drawerCanvas.tap()
  await expect.poll(() => getInkPixelCount(guesserCanvas)).toBeGreaterThan(0)

  await page.reload()
  await expect(page.getByTestId('drawing-stage')).toHaveAttribute(
    'data-realtime-status',
    'ready',
  )
  await expect
    .poll(() => getInkPixelCount(page.getByLabel('Team Sun drawing canvas')))
    .toBeGreaterThan(0)

  // Local history is intentionally not serialized. Server-projected
  // capabilities keep semantic undo/redo usable after a refresh.
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect.poll(() => getInkPixelCount(guesserCanvas)).toBe(0)
  await expect(page.getByRole('button', { name: 'Redo' })).toBeEnabled()
  await page.getByRole('button', { name: 'Redo' }).click()
  await expect.poll(() => getInkPixelCount(guesserCanvas)).toBeGreaterThan(0)

  await expect(guesserPage.getByTestId('word-length')).toHaveText('10 letters')
  await expect(guesserPage.getByTestId('final-word')).toHaveCount(0)

  const stageBefore = await guesserPage
    .getByTestId('drawing-stage')
    .boundingBox()
  await guesserPage.getByLabel('Your guess').fill('sailboat')
  await guesserPage.getByLabel('Your guess').press('Enter')
  await expect(
    guesserPage.getByTestId('guess-composer').getByRole('status'),
  ).toHaveText('Not quite. Keep looking at the drawing.')
  const stageAfter = await guesserPage
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
  expect(await guesserPage.evaluate(() => window.scrollY)).toBe(0)
  await expect(guesserPage.getByLabel('Your guess')).toBeFocused()
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
