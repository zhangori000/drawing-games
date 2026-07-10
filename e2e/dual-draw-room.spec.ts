import { expect, test, type BrowserContext, type Page } from '@playwright/test'

const ROOM_CODE = 'E2E01'
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
