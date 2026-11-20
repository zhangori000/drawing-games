import type { MatchCreditView } from '@drawing-games/game-core'
import { expect, test } from 'vitest'

import { ManualTimers } from '../testing/manual-timers'
import { FakeSocket, ack, makeView } from '../testing/fake-socket'
import { installMemoryStorage } from '../testing/memory-storage'
import { getWordHistory } from '../word-history'
import type { SeatStore } from './connection-types'
import {
  RoomClient,
  accountLinkNotice,
  drawableCanvasId,
  type AccountTokenSource,
} from './room-client'

test('drawing batches only target the canvas the view says this member may draw on', () => {
  expect(drawableCanvasId(null)).toBeNull()
  expect(drawableCanvasId(makeView({ phase: 'lobby' }))).toBeNull()

  const round = (canDraw: boolean) => ({
    number: 1,
    mine: { canvasId: 'm1-r1-A', canDraw },
  })
  expect(
    drawableCanvasId(makeView({ phase: 'drawing', round: round(true) })),
  ).toBe('m1-r1-A')
  expect(
    drawableCanvasId(makeView({ phase: 'drawing', round: round(false) })),
  ).toBeNull()
  // Picking a word is not drawing yet.
  expect(
    drawableCanvasId(makeView({ phase: 'word-draft', round: round(true) })),
  ).toBeNull()

  const showdown = (canDraw: boolean) => ({
    mine: { canvasId: 'm1-sd-B-2', canDraw },
  })
  expect(
    drawableCanvasId(makeView({ phase: 'showdown', showdown: showdown(true) })),
  ).toBe('m1-sd-B-2')
  expect(
    drawableCanvasId(
      makeView({ phase: 'showdown', showdown: showdown(false) }),
    ),
  ).toBeNull()
  expect(
    drawableCanvasId(makeView({ phase: 'round-results', round: round(true) })),
  ).toBeNull()
})

/* ------------------------- account link follows sign-in ------------------------- */

const ROOM = 'ABCDE'
const RESUME_TOKEN = 'resume-token-abcdefghijklmnop'
const MINA = 'mina_42.abcdefghijklmnopqrstuvwxyzABCDEF012345'
const MINA_AGAIN = 'mina_42.ZYXWVUTSRQPONMLKJIHGFEDCBA9876543210'
const OTTO = 'otto.abcdefghijklmnopqrstuvwxyzABCDEF012345'

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0))

class FakeAccountTokens implements AccountTokenSource {
  private readonly listeners = new Set<() => void>()
  constructor(public token: string | null) {}
  read = () => this.token
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  /** Signing in or out in this tab or another one. */
  set(token: string | null) {
    this.token = token
    for (const listener of [...this.listeners]) listener()
  }
  get listenerCount() {
    return this.listeners.size
  }
}

function seatStore(): SeatStore {
  const seat = {
    memberId: 'm1',
    resumeToken: RESUME_TOKEN,
    displayName: 'Mina',
    savedAtMs: 0,
  }
  return {
    loadTabSeat: () => seat,
    loadLatestSeat: () => seat,
    saveSeat: () => {},
    claimSeatForTab: () => {},
    updateSeatDisplayName: () => {},
    forgetSeat: () => {},
  }
}

/**
 * A seated member's view as the room sends it (plain JSON). On the final
 * screen the match is saved to the seat's account unless `matchCredit` says
 * otherwise.
 */
function seatedView(
  accountId: string | null,
  phase = 'lobby',
  matchCredit: MatchCreditView | null = phase === 'stats'
    ? { played: true, savedTo: accountId }
    : null,
) {
  return JSON.parse(
    JSON.stringify(
      makeView({
        phase,
        me: {
          memberId: 'm1',
          team: 'A',
          isHost: true,
          role: 'idle',
          accountId,
          matchCredit,
        },
      }),
    ),
  )
}

function accountClient(token: string | null) {
  const timers = new ManualTimers()
  const sockets: FakeSocket[] = []
  const tokens = new FakeAccountTokens(token)
  let seq = 0
  const client = new RoomClient(ROOM, {
    sessionId: 'tab-session-1',
    clientSeqStore: { load: () => seq, store: (value) => (seq = value) },
    seats: seatStore(),
    timers,
    now: timers.now,
    random: () => 0.5,
    lifecycle: null,
    accountTokens: tokens,
    createSocket: (url) => {
      const socket = new FakeSocket(url)
      sockets.push(socket)
      return socket
    },
    socketUrl: (room, session) => `ws://test/rooms/${room}/socket?s=${session}`,
  })
  const socket = () => {
    const last = sockets.at(-1)
    if (!last) throw new Error('no socket')
    return last
  }
  /** Opens the socket, acks the resume, and delivers the room's view. */
  const bind = (accountId: string | null, phase = 'lobby') => {
    client.start()
    socket().open()
    const resume = socket().lastEnvelope()
    socket().receive(ack(resume.commandId, resume.clientSeq))
    socket().receive({
      type: 'room.snapshot',
      state: seatedView(accountId, phase),
    })
  }
  const links = () =>
    socket()
      .envelopes()
      .filter((envelope) => envelope.command.type === 'account.link')
  const toasts = () => client.getSnapshot().toasts.map((toast) => toast.message)
  return { client, tokens, socket, bind, links, toasts }
}

test('unreadable-message errors from the room are not shown as toasts', () => {
  const ctx = accountClient(null)
  ctx.bind(null)
  // Garbled or over the size cap, and no command to tie it to.
  ctx.socket().receive({
    type: 'protocol.error',
    code: 'BAD_COMMAND',
    message: 'Commands must be JSON.',
    retryable: false,
  })
  ctx.socket().receive({
    type: 'protocol.error',
    code: 'BAD_COMMAND',
    message: 'Commands are limited to 64 KiB.',
    retryable: false,
    details: { reason: 'message-too-large', maxBytes: 65_536 },
  })
  expect(ctx.toasts()).toEqual([])
  // The room's plain-language errors still show.
  ctx.socket().receive({
    type: 'protocol.error',
    code: 'NOT_ALLOWED',
    message: 'Only the host can start the match.',
    retryable: false,
    commandId: 'long-gone-command',
  })
  expect(ctx.toasts()).toEqual(['Only the host can start the match.'])
})

test('signing out in another tab unlinks the open seat so later play is not recorded', async () => {
  const ctx = accountClient(MINA)
  ctx.bind('mina_42')
  expect(ctx.links()).toHaveLength(0)

  ctx.tokens.set(null)
  const [unlink] = ctx.links()
  expect(unlink?.command).toEqual({ type: 'account.link', accountToken: null })

  ctx.socket().receive(ack(unlink!.commandId, unlink!.clientSeq))
  ctx.socket().receive({ type: 'room.snapshot', state: seatedView(null) })
  await flushPromises()
  expect(ctx.toasts()).toContain('Signed out: this seat no longer saves stats.')
  // Nothing left to reconcile: later views send nothing more.
  ctx.socket().receive({ type: 'room.snapshot', state: seatedView(null) })
  expect(ctx.links()).toHaveLength(1)
})

test('a seat still linked after signing out while the room was closed is unlinked once', () => {
  const ctx = accountClient(null)
  ctx.bind('mina_42', 'drawing')
  expect(ctx.links().map((envelope) => envelope.command)).toEqual([
    { type: 'account.link', accountToken: null },
  ])
  // More views before the ack arrive: still one request.
  ctx.socket().receive({
    type: 'room.snapshot',
    state: seatedView('mina_42', 'drawing'),
  })
  expect(ctx.links()).toHaveLength(1)
})

test('signing in elsewhere links a guest seat, and the sign-up form shares that request', async () => {
  const ctx = accountClient(null)
  ctx.bind(null, 'stats')
  expect(ctx.links()).toHaveLength(0)

  ctx.tokens.set(MINA)
  const explicit = ctx.client.actions.linkAccount(MINA)
  const links = ctx.links()
  expect(links.map((envelope) => envelope.command)).toEqual([
    { type: 'account.link', accountToken: MINA },
  ])

  ctx.socket().receive(ack(links[0]!.commandId, links[0]!.clientSeq))
  await expect(explicit).resolves.toBeUndefined()
  // The toast waits for the room's view of the linked seat (sent right
  // after the ack), which says where the match went.
  expect(ctx.toasts()).toEqual([])
  ctx.socket().receive({
    type: 'room.snapshot',
    state: seatedView('mina_42', 'stats'),
  })
  expect(ctx.toasts()).toContain(
    'Saved to @mina_42: this match is in your stats.',
  )
})

test('signing in on the final screen after joining late says only the next matches count', async () => {
  const ctx = accountClient(null)
  ctx.client.start()
  ctx.socket().open()
  const resume = ctx.socket().lastEnvelope()
  ctx.socket().receive(ack(resume.commandId, resume.clientSeq))
  ctx.socket().receive({
    type: 'room.snapshot',
    state: seatedView(null, 'stats', { played: false, savedTo: null }),
  })

  ctx.tokens.set(MINA)
  const [link] = ctx.links()
  ctx.socket().receive(ack(link!.commandId, link!.clientSeq))
  ctx.socket().receive({
    type: 'room.snapshot',
    state: seatedView('mina_42', 'stats', { played: false, savedTo: null }),
  })
  await flushPromises()
  expect(ctx.toasts()).toEqual([
    'Signed in as @mina_42: your next matches here will be saved.',
  ])
})

test('a refused link is not retried until the seat or the sign-in changes', async () => {
  const ctx = accountClient(MINA)
  ctx.bind(null)
  const [first] = ctx.links()
  expect(first?.command).toEqual({ type: 'account.link', accountToken: MINA })
  ctx.socket().receive({
    type: 'protocol.error',
    code: 'UNAUTHORIZED',
    message: 'That account session has expired. Log in again.',
    retryable: false,
    commandId: first!.commandId,
  })
  await flushPromises()
  // The automatic link fails quietly; the account screen handles expiry.
  expect(ctx.toasts()).toEqual([])
  ctx.socket().receive({ type: 'room.snapshot', state: seatedView(null) })
  expect(ctx.links()).toHaveLength(1)

  // Logging in again gives a new session token: try once more.
  ctx.tokens.set(MINA_AGAIN)
  expect(ctx.links().at(-1)?.command).toEqual({
    type: 'account.link',
    accountToken: MINA_AGAIN,
  })
})

test('switching accounts relinks the seat to the account now signed in', () => {
  const ctx = accountClient(MINA)
  ctx.bind('mina_42')
  ctx.tokens.set(null)
  ctx.tokens.set(OTTO)
  expect(ctx.links().map((envelope) => envelope.command)).toEqual([
    { type: 'account.link', accountToken: null },
    { type: 'account.link', accountToken: OTTO },
  ])
})

test('sign-in changes before the seat is bound wait for the handshake, and stop() unsubscribes', () => {
  const ctx = accountClient(MINA)
  ctx.client.start()
  ctx.tokens.set(null)
  ctx.socket().open()
  // The resume carries no account token now; nothing else was sent.
  expect(
    ctx
      .socket()
      .envelopes()
      .map((envelope) => envelope.command.type),
  ).toEqual(['room.resume'])
  expect(ctx.tokens.listenerCount).toBe(1)
  ctx.client.stop()
  expect(ctx.tokens.listenerCount).toBe(0)
})

test('account link notices say what the room recorded for the seat', () => {
  const notice = (
    before: string | null,
    after: string | null,
    phase = 'lobby',
    credit?: MatchCreditView | null,
  ) =>
    accountLinkNotice(
      seatedView(before, phase, credit),
      seatedView(after, phase, credit),
    )
  expect(notice('mina_42', null)).toBe(
    'Signed out: this seat no longer saves stats.',
  )
  expect(notice(null, 'mina_42')).toBe(
    'Signed in as @mina_42: your matches here will be saved.',
  )
  // Mid-match, linking credits the rounds so far and the rest.
  expect(notice(null, 'mina_42', 'round-results')).toBe(
    'Saved to @mina_42: this match is in your stats.',
  )
  expect(
    notice(null, 'mina_42', 'stats', { played: true, savedTo: 'mina_42' }),
  ).toBe('Saved to @mina_42: this match is in your stats.')
  // Joined after the match: nothing to save from it.
  expect(
    notice(null, 'mina_42', 'stats', { played: false, savedTo: null }),
  ).toBe('Signed in as @mina_42: your next matches here will be saved.')
  // Already saved to the account this seat had before.
  expect(
    notice(null, 'otto', 'stats', { played: true, savedTo: 'mina_42' }),
  ).toBe(
    'Signed in as @otto: your next matches here will be saved. This one stays saved to @mina_42.',
  )

  // Only a change to this seat's link is announced.
  const view = seatedView('mina_42', 'stats')
  expect(accountLinkNotice(view, view)).toBeNull()
  expect(accountLinkNotice(null, view)).toBeNull()
  expect(accountLinkNotice(makeView(), view)).toBeNull()
  const otherSeat = JSON.parse(JSON.stringify(seatedView(null)))
  otherSeat.me.memberId = 'm0'
  expect(accountLinkNotice(otherSeat, seatedView('mina_42'))).toBeNull()
})

/* ------------------------ drawing batches name a canvas ------------------------ */

test('drawing batches name their canvas, and a stale refusal is dropped quietly', async () => {
  const ctx = accountClient(null)
  ctx.client.start()
  ctx.socket().open()
  const resume = ctx.socket().lastEnvelope()
  ctx.socket().receive(ack(resume.commandId, resume.clientSeq))
  const drawing = seatedView(null, 'drawing')
  drawing.me.role = 'drawer'
  drawing.round = { number: 1, mine: { canvasId: 'm1-r1-A', canDraw: true } }
  ctx.socket().receive({ type: 'room.snapshot', state: drawing })

  ctx.client.actions.sendDrawing('m1-r1-A', [
    {
      type: 'stroke.begin',
      strokeId: 's1',
      point: { x: 0.2, y: 0.2 },
      style: { color: '#181713', width: 0.01, opacity: 1 },
    },
  ])
  ctx.client.canvasStore.flush()
  const batch = ctx.socket().lastEnvelope()
  expect(batch.command).toMatchObject({
    type: 'drawing.batch',
    canvasId: 'm1-r1-A',
  })

  // The round ended while the batch was in flight: the room refuses it.
  ctx.socket().receive({
    type: 'protocol.error',
    code: 'STALE_CLIENT',
    message: 'That drawing was for a canvas that has ended.',
    retryable: false,
    commandId: batch.commandId,
  })
  await flushPromises()
  expect(ctx.client.canvasStore.hasUnsentOps()).toBe(false)
  expect(ctx.toasts()).toEqual([])
  // Never resent.
  expect(
    ctx
      .socket()
      .envelopes()
      .filter((envelope) => envelope.command.type === 'drawing.batch'),
  ).toHaveLength(1)
})

/* ---------------------- guest word memory follows play ---------------------- */

test('a "seen it" swap the room accepts makes the word strict guest memory', async () => {
  installMemoryStorage()
  const ctx = accountClient(null)
  ctx.bind(null, 'word-draft')

  const refused = ctx.client.actions.replaceWord('food/pizza', 'seen-before')
  const first = ctx.socket().lastEnvelope()
  ctx.socket().receive({
    type: 'protocol.error',
    code: 'NOT_ALLOWED',
    message: 'No swaps left.',
    retryable: false,
    commandId: first.commandId,
  })
  await expect(refused).rejects.toThrow('No swaps left.')
  expect(getWordHistory()).toEqual({ avoid: [], soft: [] })

  const unknown = ctx.client.actions.replaceWord(
    'animals/axolotl',
    'unknown-definition',
  )
  const second = ctx.socket().lastEnvelope()
  ctx.socket().receive(ack(second.commandId, second.clientSeq))
  await unknown

  const seen = ctx.client.actions.replaceWord('animals/cat', 'seen-before')
  const third = ctx.socket().lastEnvelope()
  ctx.socket().receive(ack(third.commandId, third.clientSeq))
  await seen
  await flushPromises()
  // "Don't know it" stays soft (it is a draft card the tracker records).
  expect(getWordHistory()).toEqual({ avoid: ['animals/cat'], soft: [] })
})
