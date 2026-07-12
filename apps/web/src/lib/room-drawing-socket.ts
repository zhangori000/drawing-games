'use client'

import type { DrawingDocument } from '@drawing-games/drawing-model'
import {
  PROTOCOL_VERSION,
  authoritativeDrawingDocumentDomainEventSchema,
  commandEnvelopeV1Schema,
  opponentDrawingActivityDomainEventSchema,
  parseServerEventEnvelopeV1,
  roomSnapshotStateSchema,
  type CommandEnvelopeV1,
  type DrawingOperation,
  type DrawingRoomViewer,
  type TeamId,
} from '@drawing-games/protocol'
import { useCallback, useEffect, useRef, useState } from 'react'

const EMPTY_DOCUMENT: DrawingDocument = {
  strokesById: {},
  strokeOrder: [],
}
const MAX_PENDING_COMMANDS = 32
const MAX_PENDING_BYTES = 384 * 1024
const SOFT_BUFFER_LIMIT = 256 * 1024
const HARD_BUFFER_LIMIT = 1024 * 1024

export type DrawingSocketStatus =
  'connecting' | 'joining' | 'ready' | 'reconnecting' | 'unavailable'

export interface DrawingSocketSeat {
  readonly id: string
  readonly displayName: string
  readonly preferredTeam: TeamId
}

export interface DrawingSocketState {
  readonly status: DrawingSocketStatus
  readonly viewer: DrawingRoomViewer | null
  readonly teamDrawing: DrawingDocument
  readonly canUndo: boolean
  readonly canRedo: boolean
  readonly opponentActive: boolean
  readonly error: string | null
  readonly submitOperations: (
    operations: readonly DrawingOperation[],
  ) => boolean
}

interface AuthoritativeDrawingProjection {
  readonly roomSeq: number
  readonly document: DrawingDocument
  readonly canUndo: boolean
  readonly canRedo: boolean
}

/**
 * Owns the disposable WebSocket while room identity and unacknowledged drawing
 * commands survive reconnects in local storage. The Durable Object remains the
 * authority; this hook only provides immediate local ink and bounded retries.
 */
export function useRoomDrawingSocket(
  roomCode: string,
  seat: DrawingSocketSeat,
): DrawingSocketState {
  const socketRef = useRef<WebSocket | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const roomSeqRef = useRef(0)
  const nextClientSeqRef = useRef(1)
  const pendingRef = useRef(new Map<string, CommandEnvelopeV1>())
  const sentThisConnectionRef = useRef(new Set<string>())
  const deferredDrawingRef = useRef<AuthoritativeDrawingProjection | null>(null)
  const readyRef = useRef(false)
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const opponentTimerRef = useRef<number | null>(null)
  const [status, setStatus] = useState<DrawingSocketStatus>('connecting')
  const [viewer, setViewer] = useState<DrawingRoomViewer | null>(null)
  const [teamDrawing, setTeamDrawing] =
    useState<DrawingDocument>(EMPTY_DOCUMENT)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [opponentActive, setOpponentActive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const persistPending = useCallback(() => {
    const sessionId = sessionIdRef.current
    if (!sessionId) return

    try {
      const key = pendingStorageKey(roomCode, seat.id, sessionId)
      const pending = [...pendingRef.current.values()]
      if (pending.length === 0) localStorage.removeItem(key)
      else localStorage.setItem(key, JSON.stringify(pending))
    } catch {
      // Private browsing or a full quota must not crash the active room. The
      // in-memory outbox still protects ordinary socket reconnects.
    }
  }, [roomCode, seat.id])

  const scheduleFlush = useCallback(() => {
    schedulePendingFlush(
      flushTimerRef,
      socketRef,
      readyRef,
      pendingRef,
      sentThisConnectionRef,
    )
  }, [])

  const cancelScheduledFlush = useCallback(() => {
    if (flushTimerRef.current === null) return
    clearTimeout(flushTimerRef.current)
    flushTimerRef.current = null
  }, [])

  const submitOperations = useCallback(
    (operations: readonly DrawingOperation[]): boolean => {
      const sessionId = sessionIdRef.current
      if (!sessionId || operations.length === 0) return false
      if (pendingRef.current.size >= MAX_PENDING_COMMANDS) {
        setError('Drawing paused while the connection catches up.')
        return false
      }

      const envelope: CommandEnvelopeV1 = {
        version: PROTOCOL_VERSION,
        commandId: createOpaqueId('draw'),
        sessionId,
        roomCode,
        clientSeq: takeClientSequence(
          roomCode,
          seat.id,
          sessionId,
          nextClientSeqRef,
        ),
        lastRoomSeq: roomSeqRef.current,
        command: { type: 'drawing.batch', operations: [...operations] },
      }

      const nextPending = [...pendingRef.current.values(), envelope]
      if (JSON.stringify(nextPending).length > MAX_PENDING_BYTES) {
        setError('Drawing paused because too many changes are waiting to send.')
        return false
      }

      pendingRef.current.set(envelope.commandId, envelope)
      persistPending()
      flushPending(socketRef, readyRef, pendingRef, sentThisConnectionRef, () =>
        scheduleFlush(),
      )
      return true
    },
    [persistPending, roomCode, scheduleFlush, seat.id],
  )

  useEffect(() => {
    let disposed = false
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let proactiveReconnectTimer: ReturnType<typeof setTimeout> | null = null
    let reconnectAttempt = 0
    let terminallyUnavailable = false
    let wasHidden = document.visibilityState === 'hidden'

    const sessionId = getOrCreateSessionId(roomCode, seat.id)
    sessionIdRef.current = sessionId
    const restoredPending = readPending(roomCode, seat.id, sessionId)
    pendingRef.current = restoredPending
    nextClientSeqRef.current = Math.max(
      readNextClientSequence(roomCode, seat.id, sessionId),
      nextSequenceAfterPending(restoredPending),
    )
    roomSeqRef.current = 0
    deferredDrawingRef.current = null
    queueMicrotask(() => {
      if (disposed) return
      setViewer(null)
      setTeamDrawing(EMPTY_DOCUMENT)
      setCanUndo(false)
      setCanRedo(false)
    })

    const applyAuthoritativeDrawing = (
      projection: AuthoritativeDrawingProjection,
    ) => {
      deferredDrawingRef.current = null
      setTeamDrawing(projection.document)
      setCanUndo(projection.canUndo)
      setCanRedo(projection.canRedo)
    }

    const receiveAuthoritativeDrawing = (
      projection: AuthoritativeDrawingProjection,
    ) => {
      if (pendingRef.current.size === 0) {
        applyAuthoritativeDrawing(projection)
        return
      }

      const deferred = deferredDrawingRef.current
      if (!deferred || projection.roomSeq >= deferred.roomSeq) {
        deferredDrawingRef.current = projection
      }
    }

    const applyDeferredDrawing = () => {
      const deferred = deferredDrawingRef.current
      if (deferred && pendingRef.current.size === 0) {
        applyAuthoritativeDrawing(deferred)
      }
    }

    const persistedNextSequence = readNextClientSequence(
      roomCode,
      seat.id,
      sessionId,
    )
    if (persistedNextSequence < nextClientSeqRef.current) {
      persistNextClientSequence(
        roomCode,
        seat.id,
        sessionId,
        nextClientSeqRef.current,
      )
    }

    const connect = () => {
      if (disposed || terminallyUnavailable) return
      const endpoint = drawingSocketUrl(roomCode, sessionId)
      if (!endpoint) {
        setStatus('unavailable')
        setError('Realtime drawing needs NEXT_PUBLIC_REALTIME_URL when hosted.')
        return
      }

      setStatus(reconnectAttempt === 0 ? 'connecting' : 'reconnecting')
      readyRef.current = false
      sentThisConnectionRef.current.clear()
      const socket = new WebSocket(endpoint)
      socketRef.current = socket

      socket.addEventListener('open', () => {
        if (disposed || socketRef.current !== socket) return
        setStatus('joining')
        setError(null)
      })

      socket.addEventListener('message', (message) => {
        if (disposed || socketRef.current !== socket) return

        try {
          const raw =
            typeof message.data === 'string'
              ? JSON.parse(message.data)
              : JSON.parse(new TextDecoder().decode(message.data))
          const envelope = parseServerEventEnvelopeV1(raw)
          roomSeqRef.current = Math.max(roomSeqRef.current, envelope.roomSeq)

          if (envelope.event.type === 'room.snapshot') {
            const snapshotResult = roomSnapshotStateSchema.safeParse(
              envelope.event.state,
            )
            if (!snapshotResult.success) {
              terminallyUnavailable = true
              readyRef.current = false
              setStatus('unavailable')
              setError(
                'This room uses an incompatible realtime snapshot. Refresh after updating the app.',
              )
              socket.close(4004, 'Incompatible room snapshot')
              return
            }
            const snapshot = snapshotResult.data
            if (snapshot.kind === 'awaiting-join') {
              readyRef.current = false
              setStatus('joining')
              socket.send(
                JSON.stringify({
                  version: PROTOCOL_VERSION,
                  commandId: createOpaqueId('join'),
                  sessionId,
                  roomCode,
                  clientSeq: takeClientSequence(
                    roomCode,
                    seat.id,
                    sessionId,
                    nextClientSeqRef,
                  ),
                  lastRoomSeq: roomSeqRef.current,
                  command: {
                    type: 'room.join',
                    displayName: seat.displayName,
                    preferredTeam: seat.preferredTeam,
                  },
                } satisfies CommandEnvelopeV1),
              )
              return
            }

            setViewer(snapshot.viewer)
            receiveAuthoritativeDrawing({
              roomSeq: envelope.roomSeq,
              document: snapshot.teamDrawing,
              canUndo: snapshot.canUndo,
              canRedo: snapshot.canRedo,
            })
            readyRef.current = true
            reconnectAttempt = 0
            setStatus('ready')
            setError(null)
            flushPending(
              socketRef,
              readyRef,
              pendingRef,
              sentThisConnectionRef,
              scheduleFlush,
            )
            return
          }

          if (envelope.event.type === 'command.ack') {
            if (pendingRef.current.delete(envelope.event.commandId)) {
              persistPending()
            }
            applyDeferredDrawing()
            return
          }

          const drawingEvent =
            authoritativeDrawingDocumentDomainEventSchema.safeParse(
              envelope.event,
            )
          if (drawingEvent.success) {
            receiveAuthoritativeDrawing({
              roomSeq: envelope.roomSeq,
              document: drawingEvent.data.payload.document,
              canUndo: drawingEvent.data.payload.canUndo,
              canRedo: drawingEvent.data.payload.canRedo,
            })
            setOpponentActive(false)
            return
          }

          const opponentEvent =
            opponentDrawingActivityDomainEventSchema.safeParse(envelope.event)
          if (opponentEvent.success) {
            setOpponentActive(true)
            if (opponentTimerRef.current !== null) {
              window.clearTimeout(opponentTimerRef.current)
            }
            opponentTimerRef.current = window.setTimeout(() => {
              opponentTimerRef.current = null
              setOpponentActive(false)
            }, 700)
            return
          }

          if (envelope.event.type === 'protocol.error') {
            const commandId = envelope.event.commandId
            const rejectedPendingDrawing =
              commandId !== undefined && pendingRef.current.has(commandId)
            if (commandId && !envelope.event.retryable) {
              pendingRef.current.delete(commandId)
              persistPending()
              applyDeferredDrawing()
            }
            setError(envelope.event.message)
            if (
              envelope.event.retryable ||
              rejectedPendingDrawing ||
              envelope.event.code === 'STALE_CLIENT' ||
              envelope.event.code === 'UNAUTHORIZED'
            ) {
              socket.close(4001, 'Fresh snapshot required')
            }
          }
        } catch {
          setError('The room sent an unreadable realtime update.')
          socket.close(4002, 'Invalid server event')
        }
      })

      socket.addEventListener('close', (event) => {
        if (socketRef.current !== socket) return
        socketRef.current = null
        readyRef.current = false
        if (disposed) return

        if (event.code === 4005) {
          terminallyUnavailable = true
          setStatus('unavailable')
          setError(
            'This room is active in another tab. Close it there, then reload this tab.',
          )
          return
        }
        if (terminallyUnavailable || event.code === 4004) {
          setStatus('unavailable')
          return
        }

        setStatus('reconnecting')
        reconnectAttempt += 1
        const baseDelay = Math.min(5_000, 250 * 2 ** reconnectAttempt)
        const jitter = Math.round(Math.random() * 150)
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null
          connect()
        }, baseDelay + jitter)
      })

      socket.addEventListener('error', () => {
        if (!disposed && socketRef.current === socket) {
          setError('Realtime drawing connection interrupted.')
        }
      })
    }

    const replaceConnection = () => {
      if (
        disposed ||
        terminallyUnavailable ||
        document.visibilityState !== 'visible'
      ) {
        return
      }
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }

      const previousSocket = socketRef.current
      socketRef.current = null
      readyRef.current = false
      reconnectAttempt = Math.max(1, reconnectAttempt)
      previousSocket?.close(4000, 'Refreshing room connection')
      connect()
    }

    const scheduleProactiveReconnect = () => {
      if (
        disposed ||
        document.visibilityState !== 'visible' ||
        proactiveReconnectTimer !== null
      ) {
        return
      }

      proactiveReconnectTimer = setTimeout(() => {
        proactiveReconnectTimer = null
        replaceConnection()
      }, 50)
    }

    const reconnectWhenVisible = () => {
      if (document.visibilityState === 'hidden') {
        wasHidden = true
        return
      }

      if (wasHidden) {
        wasHidden = false
        scheduleProactiveReconnect()
      }
    }

    const reconnectWhenOnline = () => scheduleProactiveReconnect()
    const reconnectFromPageCache = (event: PageTransitionEvent) => {
      if (event.persisted) scheduleProactiveReconnect()
    }

    connect()
    document.addEventListener('visibilitychange', reconnectWhenVisible)
    window.addEventListener('online', reconnectWhenOnline)
    window.addEventListener('pageshow', reconnectFromPageCache)

    return () => {
      disposed = true
      readyRef.current = false
      if (reconnectTimer !== null) clearTimeout(reconnectTimer)
      if (proactiveReconnectTimer !== null) {
        clearTimeout(proactiveReconnectTimer)
      }
      cancelScheduledFlush()
      if (opponentTimerRef.current !== null) {
        window.clearTimeout(opponentTimerRef.current)
        opponentTimerRef.current = null
      }
      document.removeEventListener('visibilitychange', reconnectWhenVisible)
      window.removeEventListener('online', reconnectWhenOnline)
      window.removeEventListener('pageshow', reconnectFromPageCache)
      socketRef.current?.close(1000, 'Room closed')
      socketRef.current = null
    }
  }, [cancelScheduledFlush, persistPending, roomCode, scheduleFlush, seat])

  return {
    status,
    viewer,
    teamDrawing,
    canUndo,
    canRedo,
    opponentActive,
    error,
    submitOperations,
  }
}

function flushPending(
  socketRef: { readonly current: WebSocket | null },
  readyRef: { readonly current: boolean },
  pendingRef: { readonly current: Map<string, CommandEnvelopeV1> },
  sentRef: { readonly current: Set<string> },
  scheduleAgain: () => void,
) {
  const socket = socketRef.current
  if (!socket || socket.readyState !== WebSocket.OPEN || !readyRef.current)
    return

  if (socket.bufferedAmount > HARD_BUFFER_LIMIT) {
    socket.close(4003, 'Drawing buffer overloaded')
    return
  }
  if (socket.bufferedAmount > SOFT_BUFFER_LIMIT) {
    scheduleAgain()
    return
  }

  for (const [commandId, envelope] of pendingRef.current) {
    if (sentRef.current.has(commandId)) continue
    socket.send(JSON.stringify(envelope))
    sentRef.current.add(commandId)
    if (socket.bufferedAmount > SOFT_BUFFER_LIMIT) {
      scheduleAgain()
      return
    }
  }
}

function schedulePendingFlush(
  timerRef: { current: ReturnType<typeof setTimeout> | null },
  socketRef: { readonly current: WebSocket | null },
  readyRef: { readonly current: boolean },
  pendingRef: { readonly current: Map<string, CommandEnvelopeV1> },
  sentRef: { readonly current: Set<string> },
) {
  if (timerRef.current !== null) return
  timerRef.current = setTimeout(() => {
    timerRef.current = null
    flushPending(socketRef, readyRef, pendingRef, sentRef, () =>
      schedulePendingFlush(timerRef, socketRef, readyRef, pendingRef, sentRef),
    )
  }, 25)
}

function drawingSocketUrl(roomCode: string, sessionId: string): string | null {
  const configured = process.env.NEXT_PUBLIC_REALTIME_URL?.trim()
  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  if (!configured && !isLocal) return null

  const url = new URL(configured || 'http://127.0.0.1:8787')
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = `/rooms/${encodeURIComponent(roomCode)}/socket`
  url.search = ''
  url.searchParams.set('sessionId', sessionId)
  return url.toString()
}

function getOrCreateSessionId(roomCode: string, seatId: string): string {
  const key = `drawing-games:session:${roomCode}:${seatId}`
  try {
    const existing = localStorage.getItem(key)
    if (existing && /^[A-Za-z0-9_-]{16,128}$/.test(existing)) return existing
    const created = createOpaqueId('session')
    localStorage.setItem(key, created)
    return created
  } catch {
    return createOpaqueId('session')
  }
}

function readPending(
  roomCode: string,
  seatId: string,
  sessionId: string,
): Map<string, CommandEnvelopeV1> {
  try {
    const raw = localStorage.getItem(
      pendingStorageKey(roomCode, seatId, sessionId),
    )
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return new Map()

    const commands = parsed
      .map((value) => commandEnvelopeV1Schema.safeParse(value))
      .filter((result) => result.success)
      .map((result) => result.data)
      .filter(
        (envelope) =>
          envelope.roomCode === roomCode &&
          envelope.sessionId === sessionId &&
          envelope.command.type === 'drawing.batch',
      )
      .slice(-MAX_PENDING_COMMANDS)
    return new Map(commands.map((command) => [command.commandId, command]))
  } catch {
    return new Map()
  }
}

function pendingStorageKey(
  roomCode: string,
  seatId: string,
  sessionId: string,
) {
  return `drawing-games:drawing-outbox:${roomCode}:${seatId}:${sessionId}`
}

function readNextClientSequence(
  roomCode: string,
  seatId: string,
  sessionId: string,
): number {
  try {
    const value = Number(
      localStorage.getItem(sequenceStorageKey(roomCode, seatId, sessionId)),
    )
    return Number.isSafeInteger(value) && value > 0 ? value : 1
  } catch {
    return 1
  }
}

function nextSequenceAfterPending(
  pending: ReadonlyMap<string, CommandEnvelopeV1>,
): number {
  let nextSequence = 1

  for (const envelope of pending.values()) {
    nextSequence = Math.max(
      nextSequence,
      Math.min(Number.MAX_SAFE_INTEGER, envelope.clientSeq + 1),
    )
  }

  return nextSequence
}

function persistNextClientSequence(
  roomCode: string,
  seatId: string,
  sessionId: string,
  nextSequence: number,
) {
  try {
    localStorage.setItem(
      sequenceStorageKey(roomCode, seatId, sessionId),
      String(nextSequence),
    )
  } catch {
    // The in-memory sequence remains monotonic for this page lifecycle.
  }
}

function takeClientSequence(
  roomCode: string,
  seatId: string,
  sessionId: string,
  sequenceRef: { current: number },
): number {
  const current = sequenceRef.current
  sequenceRef.current = Math.min(Number.MAX_SAFE_INTEGER, current + 1)
  persistNextClientSequence(roomCode, seatId, sessionId, sequenceRef.current)
  return current
}

function sequenceStorageKey(
  roomCode: string,
  seatId: string,
  sessionId: string,
) {
  return `drawing-games:client-seq:${roomCode}:${seatId}:${sessionId}`
}

function createOpaqueId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`
}
