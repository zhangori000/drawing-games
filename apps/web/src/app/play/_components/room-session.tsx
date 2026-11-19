'use client'

import type {
  MemberView,
  MeView,
  RoomView,
  TeamId,
} from '@drawing-games/game-core'
import { createContext, useContext, useMemo } from 'react'

import type { CanvasStore } from '@/lib/realtime/canvas-store'
import type { GuessFeedback, RoomActions } from '@/lib/realtime/use-room'

import type { Pending } from '../_lib/use-pending'

/** Pack metadata plus its word count, computed on the server. */
export interface PackInfo {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly kidFriendly: boolean
  readonly wordCount: number
}

/** Everything a seated player's screens need, shared through context. */
export interface RoomSession {
  readonly roomCode: string
  readonly view: RoomView
  readonly me: MeView
  readonly actions: RoomActions
  readonly canvasStore: CanvasStore
  readonly serverNow: () => number
  readonly lastFeedback: GuessFeedback | null
  readonly pending: Pending
  readonly packs: readonly PackInfo[]
}

const RoomSessionContext = createContext<RoomSession | null>(null)

export const RoomSessionProvider = RoomSessionContext

export function useRoomSession(): RoomSession {
  const session = useContext(RoomSessionContext)
  if (!session) throw new Error('useRoomSession needs <RoomSessionProvider>')
  return session
}

/** Members by id, plus the roster of each team in rotation order. */
export function useMembers(): {
  readonly byId: ReadonlyMap<string, MemberView>
  readonly team: (team: TeamId) => readonly MemberView[]
} {
  const { view } = useRoomSession()
  return useMemo(() => {
    const byId = new Map(view.members.map((member) => [member.id, member]))
    return {
      byId,
      team: (team: TeamId) =>
        view.teams[team].memberIds
          .map((id) => byId.get(id))
          .filter((member): member is MemberView => member !== undefined),
    }
  }, [view.members, view.teams])
}
