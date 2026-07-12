import { expect, test, type Locator, type Page } from '@playwright/test'

interface InkBounds {
  readonly count: number
  readonly width: number
  readonly height: number
  readonly expectedMediumDiameter: number
}

test('a jittery mouse tap makes one round stroke-sized dot and a drag stays one stroke', async ({
  page,
}) => {
  await page.goto('/games/dual-draw/lab')

  const canvas = page.getByLabel('Local drawing canvas')
  await expect(page.getByText('Drag to draw · tap for dots')).toBeVisible()
  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  if (!box) return

  const start = {
    x: box.x + box.width * 0.5,
    y: box.y + box.height * 0.5,
  }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 2, start.y + 1)
  await page.mouse.up()

  await expect
    .poll(async () => (await getInkBounds(canvas)).count)
    .toBeGreaterThan(0)
  const dot = await getInkBounds(canvas)
  expect(Math.abs(dot.width - dot.height)).toBeLessThanOrEqual(2)
  expect(dot.width).toBeGreaterThanOrEqual(dot.expectedMediumDiameter - 2)
  expect(dot.width).toBeLessThanOrEqual(dot.expectedMediumDiameter + 2)

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect.poll(async () => (await getInkBounds(canvas)).count).toBe(0)

  await page.mouse.move(start.x - 30, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 30, start.y, { steps: 6 })

  // Ink is painted imperatively during the gesture; it does not wait for the
  // pointer-up operation batch or a React render.
  await expect
    .poll(async () => {
      const line = await getInkBounds(canvas)
      return line.width > line.height * 4
    })
    .toBe(true)

  await page.mouse.up()

  await expect
    .poll(async () => {
      const line = await getInkBounds(canvas)
      return line.width > line.height * 4
    })
    .toBe(true)

  // A drag is not a dot plus a line: one undo removes the entire gesture.
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect.poll(async () => (await getInkBounds(canvas)).count).toBe(0)
})

test('a pen tap uses the same Pointer Events drawing path', async ({
  context,
  page,
}) => {
  await page.goto('/games/dual-draw/lab')

  const canvas = page.getByLabel('Local drawing canvas')
  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  if (!box) return

  const session = await context.newCDPSession(page)
  const point = {
    x: box.x + box.width * 0.6,
    y: box.y + box.height * 0.5,
  }
  await session.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    ...point,
    pointerType: 'pen',
  })
  await session.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    ...point,
    button: 'left',
    buttons: 1,
    clickCount: 1,
    pointerType: 'pen',
  })
  await session.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    ...point,
    button: 'left',
    buttons: 0,
    clickCount: 1,
    pointerType: 'pen',
  })

  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled()
  await expect
    .poll(async () => (await getInkBounds(canvas)).count)
    .toBeGreaterThan(0)
})

test('a cancelled pointer discards its uncommitted ink', async ({
  context,
  page,
}) => {
  await page.goto('/games/dual-draw/lab')

  const canvas = page.getByLabel('Local drawing canvas')
  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  if (!box) return

  const session = await context.newCDPSession(page)
  await session.send('Emulation.setTouchEmulationEnabled', {
    enabled: true,
    maxTouchPoints: 1,
  })
  const start = {
    x: box.x + box.width * 0.35,
    y: box.y + box.height * 0.45,
  }
  const end = { x: start.x + 80, y: start.y + 20 }

  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...start, id: 0 }],
  })
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ ...end, id: 0 }],
  })
  await expect
    .poll(async () => (await getInkBounds(canvas)).count)
    .toBeGreaterThan(0)

  await session.send('Input.dispatchTouchEvent', {
    type: 'touchCancel',
    touchPoints: [],
  })

  await expect.poll(async () => (await getInkBounds(canvas)).count).toBe(0)
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()
})

test('object erase, undo, redo, and clear work through the real toolbar', async ({
  page,
}) => {
  await page.goto('/games/dual-draw/lab')

  const canvas = page.getByLabel('Local drawing canvas')
  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  if (!box) return

  const firstStroke = {
    start: { x: box.x + box.width * 0.2, y: box.y + box.height * 0.35 },
    end: { x: box.x + box.width * 0.4, y: box.y + box.height * 0.35 },
  }
  const secondStroke = {
    start: { x: box.x + box.width * 0.6, y: box.y + box.height * 0.65 },
    end: { x: box.x + box.width * 0.8, y: box.y + box.height * 0.65 },
  }

  await drawLine(page, firstStroke.start, firstStroke.end)
  await drawLine(page, secondStroke.start, secondStroke.end)
  await expect
    .poll(async () => (await getInkBounds(canvas)).count)
    .toBeGreaterThan(0)
  const beforeErase = (await getInkBounds(canvas)).count

  await page.getByRole('button', { name: 'Object erase' }).click()
  await expect(page.getByText('Tap a stroke to erase it')).toBeVisible()
  await page.mouse.click(
    (firstStroke.start.x + firstStroke.end.x) / 2,
    firstStroke.start.y,
  )

  await expect
    .poll(async () => (await getInkBounds(canvas)).count)
    .toBeLessThan(beforeErase)
  const afterErase = (await getInkBounds(canvas)).count
  expect(afterErase).toBeGreaterThan(0)

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect
    .poll(async () => (await getInkBounds(canvas)).count)
    .toBe(beforeErase)

  await page.getByRole('button', { name: 'Redo' }).click()
  await expect
    .poll(async () => (await getInkBounds(canvas)).count)
    .toBe(afterErase)

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Clear' }).click()
  await expect.poll(async () => (await getInkBounds(canvas)).count).toBe(0)

  // Clear is a semantic action too: undo restores the post-erase drawing.
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect
    .poll(async () => (await getInkBounds(canvas)).count)
    .toBe(afterErase)
})

async function drawLine(
  page: Page,
  start: { readonly x: number; readonly y: number },
  end: { readonly x: number; readonly y: number },
) {
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 8 })
  await page.mouse.up()
}

async function getInkBounds(canvas: Locator): Promise<InkBounds> {
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
    let minX = element.width
    let minY = element.height
    let maxX = -1
    let maxY = -1
    let count = 0

    for (let y = 0; y < element.height; y += 1) {
      for (let x = 0; x < element.width; x += 1) {
        const index = (y * element.width + x) * 4
        const red = pixels[index] ?? 255
        const green = pixels[index + 1] ?? 255
        const blue = pixels[index + 2] ?? 255
        if (red >= 250 && green >= 250 && blue >= 250) continue

        count += 1
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }

    return {
      count,
      width: count === 0 ? 0 : maxX - minX + 1,
      height: count === 0 ? 0 : maxY - minY + 1,
      expectedMediumDiameter: 0.012 * Math.min(element.width, element.height),
    }
  })
}
