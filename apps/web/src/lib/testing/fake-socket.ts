import type { RoomView } from '@drawing-games/game-core'
import {
  PROTOCOL_VERSION,
  type CommandEnvelopeV1,
  type ServerEvent,
} from '@drawing-games/protocol'

import type { WebSocketLike } from '../realtime/connection-types'

/** Scriptable stand-in for a browser WebSocket. */
export class FakeSocket implements WebSocketLike {
  readyState = 0
  bufferedAmount = 0
  closedWith: number | null = null
  readonly sent: string[] = []
  onopen: WebSocketLike['onopen'] = null
  onmessage: WebSocketLike['onmessage'] = null
  onclose: WebSocketLike['onclose'] = null
  onerror: WebSocketLike['onerror'] = null

  constructor(readonly url: string) {}

  send(data: string): void {
    if (this.readyState !== 1) throw new Error('socket is not open')
    this.sent.push(data)
  }

  close(code?: number): void {
    this.readyState = 3
    this.closedWith = code ?? 1000
  }

  /* Test controls */

  open(): void {
    this.readyState = 1
    this.onopen?.({})
  }

  serverClose(code: number): void {
    this.readyState = 3
    this.onclose?.({ code, reason: '' })
  }

  receive(
    event: ServerEvent,
    options: {
      roomCode?: string
      roomSeq?: number
      serverTimeMs?: number
    } = {},
  ): void {
    this.onmessage?.({
      data: JSON.stringify({
        version: PROTOCOL_VERSION,
        roomCode: options.roomCode ?? 'ABCDE',
        roomSeq: options.roomSeq ?? 1,
        serverTimeMs: options.serverTimeMs ?? 1_000_000,
        event,
      }),
    })
  }

  envelopes(): CommandEnvelopeV1[] {
    return this.sent.map((data) => JSON.parse(data) as CommandEnvelopeV1)
  }

  lastEnvelope(): CommandEnvelopeV1 {
    const last = this.envelopes().at(-1)
    if (!last) throw new Error('nothing was sent')
    return last
  }
}

export function ack(
  commandId: string,
  clientSeq: number,
  status: 'applied' | 'duplicate' = 'applied',
): ServerEvent {
  return { type: 'command.ack', commandId, clientSeq, status }
}

type JsonPayload = Extract<ServerEvent, { type: 'domain.event' }>['payload']

export function domainEvent(name: string, payload: JsonPayload): ServerEvent {
  return { type: 'domain.event', name, payload }
}

/** A structurally valid RoomView with test overrides. */
export function makeView(overrides: Record<string, unknown> = {}): RoomView {
  const base = {
    roomCode: 'ABCDE',
    seq: 1,
    phase: 'lobby',
    phaseStartedAtMs: 0,
    phaseDeadlineAtMs: null,
    hostId: null,
    me: null,
    settings: {},
    members: [],
    teams: {
      A: {
        id: 'A',
        name: 'Sun',
        score: 0,
        roundsWon: 0,
        memberIds: [],
        drawerId: null,
      },
      B: {
        id: 'B',
        name: 'Moon',
        score: 0,
        roundsWon: 0,
        memberIds: [],
        drawerId: null,
      },
    },
    lobby: null,
    match: null,
    round: null,
    results: null,
    showdown: null,
    final: null,
    surrender: null,
  }
  return { ...base, ...overrides } as unknown as RoomView
}
