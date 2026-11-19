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
  await expect(
    page.getByText('At least 6 characters', { exact: true }),
  ).toBeVisible()

  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByLabel('Display name (optional)').fill('E2E Painter')
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL(/\/me$/)
  await expect(page.getByRole('heading', { name: 'E2E Painter' })).toBeVisible()
  await expect(page.getByText(`@${username}`)).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Lifetime stats' }),
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
