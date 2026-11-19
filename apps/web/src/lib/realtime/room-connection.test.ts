import { expect, test } from '@playwright/test'

import type { Seat } from '../identity'
import { ManualTimers } from '../testing/manual-timers'
import { FakeSocket, ack, domainEvent, makeView } from '../testing/fake-socket'
import type { RoomConnectionEvent, SeatStore } from './connection-types'
import { RoomConnection } from './room-connection'

const ROOM = 'ABCDE'
const TOKEN = 'resume-token-abcdefghijklmnop'
const ACCOUNT = 'mina_42.abcdefghijklmnopqrstuvwxyzABCDEF012345'

class MemorySeats implements SeatStore {
  latest: Seat | null = null
  tab: Seat | null = null
  forgotten: string[] = []

  loadTabSeat = () => this.tab
  loadLatestSeat = () => this.latest
  saveSeat = (_room: string, seat: Omit<Seat, 'savedAtMs'>) => {
    this.latest = { ...seat, savedAtMs: 0 }
    this.tab = this.latest
  }
  claimSeatForTab = () => {
    this.tab = this.latest
  }
  updateSeatDisplayName = () => {}
  forgetSeat = (_room: string, memberId?: string) => {
    this.forgotten.push(memberId ?? '?')
    this.tab = null
    this.latest = null
  }
}

function setup(
  options: {
    seats?: MemorySeats
    accountToken?: string | null
    recentWordIds?: string[]
  } = {},
) {
  const timers = new ManualTimers()
  const sockets: FakeSocket[] = []
  const seats = options.seats ?? new MemorySeats()
  const events: RoomConnectionEvent[] = []
  let seq = 0
  const connection = new RoomConnection({
    roomCode: ROOM,
    sessionId: 'tab-session-1',
    clientSeqStore: { load: () => seq, store: (value) => (seq = value) },
    seats,
    timers,
    now: timers.now,
    random: () => 0.5,
    lifecycle: null,
    getAccountToken: () => options.accountToken ?? null,
    getRecentWordIds: () => options.recentWordIds ?? [],
    createSocket: (url) => {
      const socket = new FakeSocket(url)
      sockets.push(socket)
      return socket
    },
    socketUrl: (room, session) =>
      `ws://test/rooms/${room}/socket?sessionId=${session}`,
  })
  connection.onEvent((event) => events.push(event))
  const socket = () => {
    const last = sockets.at(-1)
    if (!last) throw new Error('no socket')
    return last
  }
  return { connection, timers, sockets, socket, seats, events }
}

function savedSeat(): MemorySeats {
  const seats = new MemorySeats()
  seats.latest = {
    memberId: 'm1',
    resumeToken: TOKEN,
    displayName: 'Mina',
    savedAtMs: 0,
  }
  seats.tab = seats.latest
  return seats
}

/** Completes a resume handshake on the current socket. */
function bindByResume(ctx: ReturnType<typeof setup>) {
  ctx.socket().open()
  const resume = ctx.socket().lastEnvelope()
  ctx.socket().receive(ack(resume.commandId, resume.clientSeq))
  return resume
}

test('without a seat it waits for join, then binds with session.issued + ack', async () => {
  const ctx = setup({
    accountToken: ACCOUNT,
    recentWordIds: ['animals/cat', 'Animals/Not-Lowercase', 'BAD'],
  })
  ctx.connection.connect()
  expect(ctx.socket().url).toBe(
    'ws://test/rooms/ABCDE/socket?sessionId=tab-session-1',
  )
  expect(ctx.connection.status).toBe('connecting')

  ctx.socket().open()
  expect(ctx.connection.status).toBe('needs-join')
  expect(ctx.socket().sent).toHaveLength(0)

  const joined = ctx.connection.join({
    displayName: '  Mina   Park ',
    team: 'B',
  })
  expect(ctx.connection.status).toBe('joining')
  const envelope = ctx.socket().lastEnvelope()
  expect(envelope).toMatchObject({
    version: 1,
    sessionId: 'tab-session-1',
    roomCode: ROOM,
    clientSeq: 1,
    lastRoomSeq: 0,
    command: {
      type: 'room.join',
      displayName: 'Mina Park',
      team: 'B',
      accountToken: ACCOUNT,
      recentWordIds: ['animals/cat'],
    },
  })
  expect(envelope.commandId).toMatch(/^[A-Za-z0-9_-]+$/)

  ctx
    .socket()
    .receive(
      domainEvent('session.issued', { memberId: 'm7', resumeToken: TOKEN }),
      { roomSeq: 4 },
    )
  ctx
    .socket()
    .receive(ack(envelope.commandId, envelope.clientSeq), { roomSeq: 4 })
  await joined
  expect(ctx.connection.status).toBe('open')
  expect(ctx.connection.getState().memberId).toBe('m7')
  expect(ctx.seats.latest).toMatchObject({
    memberId: 'm7',
    resumeToken: TOKEN,
    displayName: 'Mina Park',
  })
  expect(ctx.events).toContainEqual({ type: 'session.issued', memberId: 'm7' })
})

test('a saved tab seat resumes with its token and account token', () => {
  const ctx = setup({ seats: savedSeat(), accountToken: ACCOUNT })
  ctx.connection.connect()
  ctx.socket().open()
  expect(ctx.socket().lastEnvelope().command).toEqual({
    type: 'room.resume',
    resumeToken: TOKEN,
    accountToken: ACCOUNT,
  })
  expect(ctx.connection.status).toBe('connecting')
  const resume = ctx.socket().lastEnvelope()
  ctx.socket().receive(ack(resume.commandId, resume.clientSeq))
  expect(ctx.connection.status).toBe('open')
})

test('send resolves on ack, rejects on protocol.error, and times out after 8 s', async () => {
  const ctx = setup({ seats: savedSeat() })
  ctx.connection.connect()
  bindByResume(ctx)

  const ready = ctx.connection.send({ type: 'lobby.ready', ready: true })
  const readyEnvelope = ctx.socket().lastEnvelope()
  expect(readyEnvelope.clientSeq).toBe(2)
  ctx.socket().receive(ack(readyEnvelope.commandId, readyEnvelope.clientSeq))
  await expect(ready).resolves.toBe('applied')

  const start = ctx.connection.send({ type: 'match.start' })
  const startEnvelope = ctx.socket().lastEnvelope()
  ctx.socket().receive({
    type: 'protocol.error',
    code: 'NOT_ALLOWED',
    message: 'Moon needs at least 2 players',
    retryable: false,
    commandId: startEnvelope.commandId,
  })
  await expect(start).rejects.toMatchObject({
    code: 'NOT_ALLOWED',
    message: 'Moon needs at least 2 players',
  })

  const shuffle = ctx.connection.send({ type: 'lobby.shuffle' })
  ctx.timers.advance(7_999)
  ctx.timers.advance(1)
  await expect(shuffle).rejects.toMatchObject({ code: 'TIMEOUT' })
})

test('commands wait while disconnected and are resent with the same ids after resume', async () => {
  const ctx = setup({ seats: savedSeat() })
  ctx.connection.connect()
  bindByResume(ctx)

  // In flight when the socket drops.
  const ready = ctx.connection.send({ type: 'lobby.ready', ready: true })
  const original = ctx.socket().lastEnvelope()
  ctx.socket().serverClose(1006)
  expect(ctx.connection.status).toBe('reconnecting')

  // Queued while offline.
  const guess = ctx.connection.send({
    type: 'guess.submit',
    text: 'lighthouse',
  })

  ctx.timers.advance(250)
  expect(ctx.sockets).toHaveLength(2)
  ctx.socket().open()
  const resume = ctx.socket().lastEnvelope()
  expect(resume.command.type).toBe('room.resume')
  expect(ctx.socket().sent).toHaveLength(1) // nothing else before the resume ack

  ctx.socket().receive(ack(resume.commandId, resume.clientSeq), { roomSeq: 9 })
  const resent = ctx.socket().envelopes().slice(1)
  expect(resent.map((envelope) => envelope.command.type)).toEqual([
    'lobby.ready',
    'guess.submit',
  ])
  expect(resent[0]).toMatchObject({
    commandId: original.commandId,
    clientSeq: original.clientSeq,
    lastRoomSeq: 9,
  })

  for (const envelope of resent) {
    ctx
      .socket()
      .receive(ack(envelope.commandId, envelope.clientSeq, 'duplicate'))
  }
  await expect(ready).resolves.toBe('duplicate')
  await expect(guess).resolves.toBe('duplicate')
})

test('reconnects with backoff and immediately on wake', () => {
  const ctx = setup({ seats: savedSeat() })
  ctx.connection.connect()
  ctx.socket().serverClose(1006)
  expect(ctx.connection.status).toBe('connecting')
  ctx.timers.advance(188) // first cap 250 ms; equal jitter at 0.5 → 188 ms
  expect(ctx.sockets).toHaveLength(2)

  ctx.socket().serverClose(1006)
  ctx.timers.advance(100)
  expect(ctx.sockets).toHaveLength(2)
  ctx.connection.wake()
  expect(ctx.sockets).toHaveLength(3)
})

test('close 4001 means replaced: no auto-reconnect until reclaim()', () => {
  const ctx = setup({ seats: savedSeat() })
  ctx.connection.connect()
  bindByResume(ctx)
  ctx.socket().serverClose(4001)
  expect(ctx.connection.status).toBe('replaced')
  expect(ctx.events).toContainEqual({ type: 'notice', notice: 'replaced' })

  ctx.timers.advance(60_000)
  ctx.connection.wake()
  expect(ctx.sockets).toHaveLength(1)

  ctx.connection.reclaim()
  expect(ctx.sockets).toHaveLength(2)
  ctx.socket().open()
  expect(ctx.socket().lastEnvelope().command.type).toBe('room.resume')
})

test('close 4404 and ROOM_NOT_FOUND end the connection as not-found', async () => {
  const ctx = setup()
  ctx.connection.connect()
  ctx.socket().open()
  const join = ctx.connection.join({ displayName: 'Theo' })
  ctx.socket().receive({
    type: 'protocol.error',
    code: 'ROOM_NOT_FOUND',
    message: 'No such room',
    retryable: false,
  })
  expect(ctx.connection.status).toBe('not-found')
  await expect(join).rejects.toMatchObject({ code: 'ROOM_NOT_FOUND' })
  ctx.timers.advance(60_000)
  expect(ctx.sockets).toHaveLength(1)

  const other = setup()
  other.connection.connect()
  other.socket().serverClose(4404)
  expect(other.connection.status).toBe('not-found')
})

test('an UNAUTHORIZED resume forgets the seat and asks to join again', () => {
  const ctx = setup({ seats: savedSeat() })
  ctx.connection.connect()
  ctx.socket().open()
  const resume = ctx.socket().lastEnvelope()
  ctx.socket().receive({
    type: 'protocol.error',
    code: 'UNAUTHORIZED',
    message: 'Unknown seat',
    retryable: false,
    commandId: resume.commandId,
  })
  expect(ctx.seats.forgotten).toEqual(['m1'])
  expect(ctx.connection.status).toBe('needs-join')
  expect(ctx.connection.getState().memberId).toBeNull()
  expect(ctx.events).toContainEqual({ type: 'notice', notice: 'seat-expired' })
})

test('a seat saved by another tab is offered, not resumed automatically', () => {
  const seats = savedSeat()
  seats.tab = null
  const ctx = setup({ seats })
  expect(ctx.connection.getState().savedSeat).toEqual({
    memberId: 'm1',
    displayName: 'Mina',
  })
  ctx.connection.connect()
  ctx.socket().open()
  expect(ctx.connection.status).toBe('needs-join')
  expect(ctx.socket().sent).toHaveLength(0)

  ctx.connection.resumeSavedSeat()
  expect(ctx.socket().lastEnvelope().command).toEqual({
    type: 'room.resume',
    resumeToken: TOKEN,
  })
  expect(ctx.connection.getState().savedSeat).toBeNull()
})

test('views, domain events, and the server clock', () => {
  const ctx = setup({ seats: savedSeat() })
  ctx.connection.connect()
  bindByResume(ctx)

  ctx.socket().receive({ type: 'room.snapshot', state: { phase: 'lobby' } })
  expect(ctx.connection.getState().view).toBeNull()

  const view = makeView({ seq: 3 })
  ctx
    .socket()
    .receive({ type: 'room.snapshot', state: JSON.parse(JSON.stringify(view)) })
  expect(ctx.connection.getState().view).toMatchObject({
    roomCode: 'ABCDE',
    seq: 3,
  })

  ctx
    .socket()
    .receive(
      domainEvent('guess.feedback', { text: 'lighthous', verdict: 'close' }),
    )
  ctx.socket().receive(domainEvent('guess.feedback', { verdict: 'nope' }))
  ctx.socket().receive(domainEvent('some.future-event', { anything: true }))
  expect(ctx.events.filter((event) => event.type === 'guess.feedback')).toEqual(
    [
      {
        type: 'guess.feedback',
        payload: { text: 'lighthous', verdict: 'close' },
      },
    ],
  )

  // Server clock runs 5 s ahead of the device.
  ctx
    .socket()
    .receive(ack('unknown', 1), { serverTimeMs: ctx.timers.now() + 5_000 })
  ctx
    .socket()
    .receive(ack('unknown', 1), { serverTimeMs: ctx.timers.now() + 5_000 })
  ctx
    .socket()
    .receive(ack('unknown', 1), { serverTimeMs: ctx.timers.now() + 5_000 })
  ctx
    .socket()
    .receive(ack('unknown', 1), { serverTimeMs: ctx.timers.now() + 5_000 })
  expect(
    Math.abs(ctx.connection.serverNow() - (ctx.timers.now() + 5_000)),
  ).toBeLessThan(50)
})

test('envelopes for another room are ignored', () => {
  const ctx = setup()
  ctx.connection.connect()
  ctx.socket().open()
  ctx.socket().receive(
    {
      type: 'room.snapshot',
      state: JSON.parse(JSON.stringify(makeView({ roomCode: 'ZZZZZ' }))),
    },
    { roomCode: 'ZZZZZ' },
  )
  expect(ctx.connection.getState().view).toBeNull()
})

test('leave forgets the seat and offers a fresh join', async () => {
  const ctx = setup({ seats: savedSeat() })
  ctx.connection.connect()
  bindByResume(ctx)
  const leaving = ctx.connection.leave()
  const leave = ctx.socket().lastEnvelope()
  expect(leave.command).toEqual({ type: 'room.leave' })
  ctx.socket().receive(ack(leave.commandId, leave.clientSeq))
  await leaving
  expect(ctx.seats.forgotten).toEqual(['m1'])
  expect(ctx.connection.status).toBe('needs-join')
  expect(ctx.sockets).toHaveLength(2)
})

test('dispose rejects pending commands and stops reconnecting', async () => {
  const ctx = setup({ seats: savedSeat() })
  ctx.connection.connect()
  const queued = ctx.connection.send(
    { type: 'lobby.shuffle' },
    { timeoutMs: null },
  )
  ctx.connection.dispose()
  await expect(queued).rejects.toMatchObject({ code: 'CLOSED' })
  expect(ctx.connection.status).toBe('closed')
  ctx.timers.advance(60_000)
  expect(ctx.sockets).toHaveLength(1)
})

test('returning after a long background replaces a possibly dead socket', () => {
  const ctx = setup({ seats: savedSeat() })
  ctx.connection.connect()
  bindByResume(ctx)
  const ready = ctx.connection.send({ type: 'lobby.ready', ready: true })
  const original = ctx.socket().lastEnvelope()

  ctx.connection.wake({ hiddenForMs: 5_000 })
  expect(ctx.sockets).toHaveLength(1)

  ctx.connection.wake({ hiddenForMs: 45_000 })
  expect(ctx.sockets).toHaveLength(2)
  expect(ctx.sockets[0]?.closedWith).toBe(1000)
  ctx.socket().open()
  const resume = ctx.socket().lastEnvelope()
  expect(resume.command.type).toBe('room.resume')
  ctx.socket().receive(ack(resume.commandId, resume.clientSeq))
  expect(ctx.socket().lastEnvelope().commandId).toBe(original.commandId)
  ctx.socket().receive(ack(original.commandId, original.clientSeq, 'duplicate'))
  return expect(ready).resolves.toBe('duplicate')
})
