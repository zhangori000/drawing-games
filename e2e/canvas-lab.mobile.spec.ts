import { expect, test } from '@playwright/test'

test('a touch tap leaves visible ink and enables undo', async ({ page }) => {
  await page.goto('/games/dual-draw/lab')

  const canvas = page.getByLabel('Local drawing canvas')
  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  if (!box) return

  await canvas.tap({
    position: { x: box.width * 0.5, y: box.height * 0.5 },
  })

  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled()
  await expect
    .poll(() =>
      canvas.evaluate((element) => {
        if (!(element instanceof HTMLCanvasElement)) return 0
        const context = element.getContext('2d')
        if (!context) return 0

        const pixels = context.getImageData(
          0,
          0,
          element.width,
          element.height,
        ).data
        let coloredPixels = 0
        for (let index = 0; index < pixels.length; index += 4) {
          const red = pixels[index] ?? 255
          const green = pixels[index + 1] ?? 255
          const blue = pixels[index + 2] ?? 255
          if (red < 250 || green < 250 || blue < 250) coloredPixels += 1
        }
        return coloredPixels
      }),
    )
    .toBeGreaterThan(0)
})
