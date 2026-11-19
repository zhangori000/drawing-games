'use client'

import { useEffect, useMemo, useSyncExternalStore } from 'react'

import type { CanvasStore } from './canvas-store'
import {
  RoomClient,
  type GuessFeedback,
  type RoomActions,
  type RoomClientSnapshot,
  type RoomToast,
} from './room-client'
import type { RoomConnectionStatus, SavedSeatSummary } from './room-connection'
import type { RoomView } from '@drawing-games/game-core'

export type { GuessFeedback, RoomActions, RoomToast }
export type { RoomConnectionStatus, SavedSeatSummary }

export interface RoomErrors {
  readonly items: readonly RoomToast[]
  dismiss(id: number): void
}

export interface UseRoomResult {
  readonly status: RoomConnectionStatus
  readonly view: RoomView | null
  readonly memberId: string | null
  /** A seat another tab saved: offer "Continue as X" / "Join as someone new". */
  readonly savedSeat: SavedSeatSummary | null
  readonly canvasStore: CanvasStore
  readonly lastFeedback: GuessFeedback | null
  readonly errors: RoomErrors
  /** Server clock estimate (epoch ms) for deadlines. */
  readonly serverNow: () => number
  readonly actions: RoomActions
}

const getServerSnapshot = (): RoomClientSnapshot => RoomClient.initialSnapshot

/**
 * Connects this screen to a room. The socket opens after mount (never during
 * server rendering) and closes on unmount or when `roomCode` changes.
 */
export function useRoom(roomCode: string): UseRoomResult {
  const client = useMemo(() => new RoomClient(roomCode), [roomCode])

  useEffect(() => {
    client.start()
    return () => client.stop()
  }, [client])

  const snapshot = useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    getServerSnapshot,
  )

  const errors = useMemo<RoomErrors>(
    () => ({ items: snapshot.toasts, dismiss: client.actions.dismissToast }),
    [snapshot.toasts, client],
  )

  return {
    status: snapshot.status,
    view: snapshot.view,
    memberId: snapshot.memberId,
    savedSeat: snapshot.savedSeat,
    canvasStore: client.canvasStore,
    lastFeedback: snapshot.lastFeedback,
    errors,
    serverNow: client.serverNow,
    actions: client.actions,
  }
}
