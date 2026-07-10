import { expect, test } from '@playwright/test'

const ROOM_CODE = 'MOB01'

test.beforeEach(async ({ request }) => {
  const response = await request.post(`/api/playtest/rooms/${ROOM_CODE}`, {
    data: { action: 'reset' },
  })
  expect(response.ok()).toBe(true)
})

test('mobile guess submit keeps the drawing stage anchored', async ({
  page,
}) => {
  await page.goto(
    `/games/dual-draw/room/${ROOM_CODE}?participant=team-a-guesser`,
  )

  await expect(page.getByTestId('word-length')).toHaveText('10 letters')
  await expect(page.getByTestId('final-word')).toHaveCount(0)

  const stageBefore = await page.getByTestId('drawing-stage').boundingBox()
  await page.getByLabel('Your guess').fill('sailboat')
  await page.getByLabel('Your guess').press('Enter')
  await expect(
    page.getByTestId('guess-composer').getByRole('status'),
  ).toHaveText('Not quite. Keep looking at the drawing.')
  const stageAfter = await page.getByTestId('drawing-stage').boundingBox()

  expect(stageBefore).not.toBeNull()
  expect(stageAfter).not.toBeNull()
  expect(
    Math.abs((stageAfter?.y ?? 0) - (stageBefore?.y ?? 0)),
  ).toBeLessThanOrEqual(1)
  expect(
    Math.abs((stageAfter?.height ?? 0) - (stageBefore?.height ?? 0)),
  ).toBeLessThanOrEqual(1)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  await expect(page.getByLabel('Your guess')).toBeFocused()
})
