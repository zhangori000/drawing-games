import { expect, test } from '@playwright/test'

/**
 * A room code that was never created: the room server upgrades the socket,
 * sends ROOM_NOT_FOUND, and closes with 4404, which the client treats as
 * final (no reconnect loop).
 */
test('a room that was never created shows Room not found without retrying', async ({
  page,
}) => {
  // Six characters: generated codes have five, so this one never exists.
  const roomCode = 'NOROOM'
  const sockets: string[] = []
  page.on('websocket', (socket) => {
    if (socket.url().includes(`/rooms/${roomCode}/socket`)) {
      sockets.push(socket.url())
    }
  })

  await page.goto(`/play/${roomCode}`)
  await expect(page.getByText('Room not found')).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByRole('link', { name: 'Back to home' })).toBeVisible()

  // Longer than the first reconnect backoff: nothing tries again.
  await page.waitForTimeout(3_000)
  expect(sockets).toHaveLength(1)
})
