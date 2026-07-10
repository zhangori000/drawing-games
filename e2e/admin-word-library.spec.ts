import { expect, test } from '@playwright/test'

test('admin curates a persistent collection while Master remains derived', async ({
  page,
}) => {
  await page.goto('/admin/words')

  await expect(
    page.getByRole('heading', { name: 'Word library' }),
  ).toBeVisible()
  await expect(page.getByTestId('master-count')).toHaveText('3')

  await page.getByLabel('New custom collection').fill('Game Night')
  await page.getByRole('button', { name: 'Create collection' }).click()
  await expect(
    page.getByRole('heading', { name: 'Game Night', exact: true }),
  ).toBeVisible()

  const addWordForm = page
    .getByRole('heading', { name: 'Add one word' })
    .locator('..')
  await addWordForm.getByLabel('Word', { exact: true }).fill('Dragon fruit')
  await addWordForm
    .getByLabel('Definition')
    .fill('A tropical fruit with bright skin and speckled flesh.')
  await addWordForm.getByLabel('Difficulty').selectOption('medium')
  await addWordForm.getByLabel('Tags, comma separated').fill('food, fruit')
  await addWordForm.getByRole('button', { name: 'Add to catalog' }).click()

  await expect(
    page.getByRole('article', { name: 'Dragon fruit word' }),
  ).toBeVisible()
  await page.getByRole('button', { name: /^Master/ }).click()
  await expect(page.getByTestId('master-count')).toHaveText('4')

  await page.reload()
  await expect(
    page.getByRole('article', { name: 'Dragon fruit word' }),
  ).toBeVisible()

  const dragonFruit = page.getByRole('article', {
    name: 'Dragon fruit word',
  })
  await dragonFruit.getByRole('button', { name: 'Deactivate' }).click()
  await expect(page.getByTestId('master-count')).toHaveText('3')
  await expect(dragonFruit).toHaveCount(0)

  await page.getByRole('button', { name: /^Game Night/ }).click()
  await expect(
    page.getByRole('article', { name: 'Dragon fruit word' }),
  ).toContainText('not playable')
})

test('admin JSON import is all-or-nothing', async ({ page }) => {
  await page.goto('/admin/words')

  await page.getByLabel('Import words JSON').fill(
    JSON.stringify([
      {
        term: 'Kite',
        definition: 'A light frame flown in the wind.',
        difficulty: 'easy',
      },
      {
        term: 'Broken row',
        definition: '',
        difficulty: 'impossible',
      },
    ]),
  )
  await page.getByRole('button', { name: 'Validate and import all' }).click()

  await expect(page.getByRole('status')).toContainText('words[1]')
  await expect(page.getByTestId('master-count')).toHaveText('3')
  await expect(page.getByText('Kite', { exact: true })).toHaveCount(0)
})
