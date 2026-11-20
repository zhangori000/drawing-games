import { expect, test } from '@playwright/test'

test('a quick account signs up, sees /me, signs out, and logs back in', async ({
  page,
}) => {
  const username = `e2e_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`
  const password = 'correct-horse-42'

  await page.goto('/account')
  await expect(
    page.getByRole('heading', { name: 'Quick account' }),
  ).toBeVisible()
  await expect(page.getByText('No email. Just a username')).toBeVisible()

  // Inline validation runs before anything is sent.
  await page.getByLabel('Username').fill('no')
  await page.getByLabel('Password').fill('123')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByLabel('Username')).toHaveAttribute(
    'aria-invalid',
    'true',
  )
  await expect(page.getByLabel('Password')).toHaveAttribute(
    'aria-invalid',
    'true',
  )
  // Errors say what to do, focus moves to the first field to fix (so a
  // screen reader announces it), and the error is part of its description.
  await expect(page.getByLabel('Username')).toBeFocused()
  await expect(page.getByLabel('Username')).toHaveAccessibleDescription(
    /Add 1 more character: usernames need at least 3\./,
  )
  await expect(
    page.getByText('Add 3 more characters: passwords need at least 6.'),
  ).toBeVisible()
  // The no-reset warning stays visible under the password error.
  await expect(page.getByText('There is no reset by email')).toBeVisible()

  await page.getByLabel('Username').fill(username)
  // A field with an error is re-checked as the player types.
  await expect(page.getByLabel('Username')).not.toHaveAttribute(
    'aria-invalid',
    'true',
  )
  await page.getByLabel('Password').fill(password)
  await expect(
    page.getByText('Add 3 more characters: passwords need at least 6.'),
  ).toHaveCount(0)
  await page.getByLabel('Display name (optional)').fill('E2E Painter')
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL(/\/me$/)
  await expect(page.getByRole('heading', { name: 'E2E Painter' })).toBeVisible()
  await expect(page.getByText(`@${username}`)).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Lifetime stats' }),
  ).toBeVisible()
  // Every tracked total has a card, in plain words.
  const stats = page.getByRole('region', { name: 'Lifetime stats' })
  for (const label of ['Points won', 'Words drawn', 'Win rate']) {
    await expect(stats.getByText(label, { exact: true })).toBeVisible()
  }
  await expect(stats.getByText('0 wins', { exact: true })).toBeVisible()
  await expect(
    stats.getByText('From the start of drawing to your answer'),
  ).toBeVisible()
  await expect(
    page.getByText(/Words you will never be offered again: \d+/),
  ).toBeVisible()

  // The session survives a reload (token in localStorage).
  await page.reload()
  await expect(page.getByRole('heading', { name: 'E2E Painter' })).toBeVisible()

  await page.getByRole('button', { name: 'Sign out' }).last().click()
  await expect(
    page.getByRole('heading', { name: 'Keep your words and stats' }),
  ).toBeVisible()

  await page.getByRole('link', { name: 'Log in' }).click()
  await expect(page.getByRole('tab', { name: 'Log in' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await page.getByLabel('Username').fill(username.toUpperCase())
  await page.getByLabel('Password').fill('wrong-password')
  await page
    .getByRole('tabpanel')
    .getByRole('button', { name: 'Log in' })
    .click()
  await expect(page.getByRole('tabpanel').getByRole('alert')).toBeVisible()

  await page.getByLabel('Password').fill(password)
  await page
    .getByRole('tabpanel')
    .getByRole('button', { name: 'Log in' })
    .click()
  await expect(page).toHaveURL(/\/me$/)
  await expect(page.getByText(`@${username}`)).toBeVisible()

  await page.goto('/')
  await expect(page.getByRole('link', { name: `@${username}` })).toBeVisible()
})

test('the join screen’s Log in link opens the Log in tab and comes back', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Practice with bots' }).click()
  await page.waitForURL(/\/play\/[A-Z0-9]{4,8}/, { timeout: 30_000 })
  const roomPath = new URL(page.url()).pathname
  await expect(
    page.getByRole('heading', { name: 'Join the room' }),
  ).toBeVisible({ timeout: 30_000 })

  await expect(
    page.getByRole('link', { name: 'sign up', exact: true }),
  ).toHaveAttribute(
    'href',
    `/account?mode=signup&next=${encodeURIComponent(roomPath)}`,
  )
  await page.getByRole('link', { name: 'Log in', exact: true }).click()
  await expect(page).toHaveURL(/\/account\?mode=login&next=/)
  await expect(page.getByRole('tab', { name: 'Log in' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
})

test('?next= after signing up never leaves this site', async ({ page }) => {
  const username = `e2e_nx${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`
  const offSite: string[] = []
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
    if (route.request().isNavigationRequest()) {
      offSite.push(route.request().url())
    }
    await route.fulfill({ status: 200, body: 'off-site' })
  })

  // A tab after the first slash would turn into `//example.com` in the
  // browser's URL parser; the page must fall back to /me instead.
  await page.goto('/account?next=/%09/example.com/pwn')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill('correct-horse-42')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/me$/)
  expect(offSite).toEqual([])

  // Signed in, a same-site `next` becomes the Continue link as is.
  await page.goto('/account?next=/play/ABCD')
  await expect(page.getByRole('link', { name: 'Continue' })).toHaveAttribute(
    'href',
    '/play/ABCD',
  )
})

test.describe('phone-sized /me', () => {
  test.use({ viewport: { width: 390, height: 664 } })

  test('renaming keeps the name field wide and long names wrap', async ({
    page,
  }) => {
    const username = `e2e_rn${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`
    await page.goto('/account')
    await page.getByLabel('Username').fill(username)
    await page.getByLabel('Password').fill('correct-horse-42')
    await page.getByLabel('Display name (optional)').fill('Renamé Ünicode Long')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page).toHaveURL(/\/me$/)

    // The whole name shows (wrapping), never cut off with an ellipsis.
    const heading = page.getByRole('heading', { name: 'Renamé Ünicode Long' })
    await expect(heading).toBeVisible()
    expect(
      await heading.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true)

    await page.getByRole('button', { name: 'Edit name' }).click()
    const field = page.getByLabel('Display name')
    await expect(field).toBeFocused()
    const card = await page.locator('section').first().boundingBox()
    const input = await field.boundingBox()
    expect(card).not.toBeNull()
    expect(input).not.toBeNull()
    // Spans the card (minus its padding), not squeezed beside the buttons.
    expect(input?.width ?? 0).toBeGreaterThanOrEqual((card?.width ?? 0) - 60)

    await field.fill('Phone Painter')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(
      page.getByRole('heading', { name: 'Phone Painter' }),
    ).toBeVisible()
    await expect(field).toBeHidden()
  })
})

test.describe('320 px /me', () => {
  test.use({ viewport: { width: 320, height: 568 } })

  test('recent matches and words fit the screen, and a teammate’s solve is not the player’s', async ({
    page,
  }) => {
    // Matches take a whole game to earn, so this layout check adds history
    // to the real profile response instead.
    await page.route(/\/accounts\/me$/, async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      const response = await route.fetch()
      const body = (await response.json()) as Record<string, unknown>
      const profile = ('profile' in body ? body.profile : body) as Record<
        string,
        unknown
      >
      const now = Date.now()
      const match = (index: number, extra: Record<string, unknown> = {}) => ({
        roomCode: `ABCD${index}`,
        matchNumber: 1,
        endedAtMs: now - 5 * 60_000,
        team: index % 2 === 0 ? 'A' : 'B',
        result: ['win', 'loss', 'tie'][index % 3],
        teamScore: 1240,
        opponentScore: 1180,
        endedReason: 'completed',
        withBots: true,
        roundsPlayed: 6,
        stats: {},
        ...extra,
      })
      profile.recentMatches = [
        match(0),
        // The longest real subtitle: surrender plus a date.
        match(1, {
          roundsPlayed: 12,
          endedReason: 'surrender',
          endedAtMs: now - 40 * 86_400_000,
        }),
        match(2),
      ]
      profile.recentWords = [
        {
          wordId: 'e2e/treasure-map',
          term: 'treasure map',
          packId: 'everyday',
          difficulty: 'medium',
          role: 'missed',
          solved: true,
          solveMs: 12_000,
          points: 87,
          atMs: now - 60_000,
          roomCode: 'ABCD0',
        },
      ]
      await route.fulfill({ response, json: body })
    })

    const username = `e2e_nm${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`
    await page.goto('/account')
    await page.getByLabel('Username').fill(username)
    await page.getByLabel('Password').fill('correct-horse-42')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page).toHaveURL(/\/me$/)

    const cards = page.getByTestId('match-card')
    await expect(cards).toHaveCount(3)
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    ).toBe(0)
    for (const box of await cards.evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect),
    )) {
      expect(box.left).toBeGreaterThanOrEqual(0)
      expect(box.right).toBeLessThanOrEqual(320)
    }
    // The team badge sits inside its card, not cut off at the screen edge.
    const badge = cards.nth(1).getByText('Moon')
    await expect(badge).toBeVisible()
    const badgeBox = await badge.boundingBox()
    expect((badgeBox?.x ?? 0) + (badgeBox?.width ?? 0)).toBeLessThanOrEqual(320)
    await expect(cards.nth(1)).toContainText('surrender')

    await expect(page.getByTestId('word-row').first()).toContainText(
      'Missed · Teammate got it in 12 s · team +87',
    )
  })
})

test('signing out in another tab stops the open room seat saving stats', async ({
  page,
}) => {
  const username = `e2e_so${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`
  await page.goto('/account')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill('correct-horse-42')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/me$/)

  await page.goto('/')
  await page.getByRole('button', { name: 'Practice with bots' }).click()
  await page.waitForURL(/\/play\/[A-Z0-9]{4,8}/, { timeout: 30_000 })
  await expect(
    page.getByRole('heading', { name: 'Join the room' }),
  ).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Join room' }).click()
  const me = page
    .locator('[data-testid="lobby-member"]')
    .filter({ hasText: '(you)' })
  await expect(me.getByText('Stats saved')).toBeVisible({ timeout: 30_000 })

  // Sign out on /me in a second tab of the same browser.
  const other = await page.context().newPage()
  await other.goto('/me')
  await other.getByRole('button', { name: 'Sign out' }).last().click()
  await expect(
    other.getByRole('heading', { name: 'Keep your words and stats' }),
  ).toBeVisible()
  await other.close()

  // The room tab unlinks its seat at once, so nothing more is recorded.
  await expect(
    page.getByText('Signed out: this seat no longer saves stats.'),
  ).toBeVisible()
  await expect(me.getByText('Stats saved')).toHaveCount(0)
})
