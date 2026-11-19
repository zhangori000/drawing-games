'use client'

import type { MeView, RoomView } from '@drawing-games/game-core'
import Link from 'next/link'
import { useEffect, useMemo, type ReactNode } from 'react'

import { Button, buttonClassName } from '@/components/ui/button'
import { Toasts } from '@/components/ui/toasts'
import { useRoom, type UseRoomResult } from '@/lib/realtime/use-room'

import { claimPracticeSetup, practiceBotPlan } from '../_lib/practice'
import { usePending, type Pending } from '../_lib/use-pending'
import { SeatGate } from './gate/seat-gate'
import { StatusScreen } from './gate/status-screen'
import { MatchScreen } from './match-screen'
import {
  RoomSessionProvider,
  type PackInfo,
  type RoomSession,
} from './room-session'

export interface RoomAppProps {
  readonly roomCode: string
  readonly packs: readonly PackInfo[]
  /** `?practice=1`: fill a solo host's room with bots once. */
  readonly practice: boolean
}

/** Connects to the room and routes between the gate, status, and match. */
export function RoomApp({ roomCode, packs, practice }: RoomAppProps) {
  const room = useRoom(roomCode)
  const pending = usePending()

  return (
    <>
      <RoomContent
        room={room}
        roomCode={roomCode}
        packs={packs}
        practice={practice}
        pending={pending}
      />
      <Toasts items={room.errors.items} onDismiss={room.errors.dismiss} />
    </>
  )
}

function RoomContent({
  room,
  roomCode,
  packs,
  practice,
  pending,
}: {
  readonly room: UseRoomResult
  readonly roomCode: string
  readonly packs: readonly PackInfo[]
  readonly practice: boolean
  readonly pending: Pending
}) {
  const { status, view, actions } = room

  switch (status) {
    case 'not-found':
      return (
        <StatusScreen
          roomCode={roomCode}
          title="Room not found"
          tone="warn"
          actions={
            <Link href="/" className={buttonClassName('primary', 'md')}>
              Back to home
            </Link>
          }
        >
          There is no room <strong className="font-mono">{roomCode}</strong>.
          Check the code, or start a new room from the home page. Empty rooms
          close after a few hours.
        </StatusScreen>
      )
    case 'replaced':
      return (
        <StatusScreen
          roomCode={roomCode}
          title="Playing in another tab"
          tone="warn"
          actions={
            <>
              <Button size="lg" onClick={() => actions.reclaim()}>
                Use this tab
              </Button>
              <Link href="/" className={buttonClassName('secondary', 'lg')}>
                Home
              </Link>
            </>
          }
        >
          Your seat was opened in another tab or device, so this one stepped
          aside. You can only play from one place at a time.
        </StatusScreen>
      )
    case 'removed':
      return (
        <RemovedScreen roomCode={roomCode} onRejoin={() => actions.leave()}>
          The host removed you from this room. You can join again as a new
          player.
        </RemovedScreen>
      )
    case 'closed':
      return (
        <StatusScreen
          roomCode={roomCode}
          title="Disconnected"
          actions={
            <Button onClick={() => window.location.reload()}>Reconnect</Button>
          }
        >
          The connection to this room was closed. Your seat is saved.
        </StatusScreen>
      )
    case 'needs-join':
    case 'joining':
    case 'unauthorized':
      return (
        <SeatGate
          roomCode={roomCode}
          status={status}
          savedSeat={room.savedSeat}
          actions={actions}
        />
      )
    case 'open':
    case 'connecting':
    case 'reconnecting':
      if (view?.me) {
        return (
          <Seated
            room={room}
            view={view}
            me={view.me}
            roomCode={roomCode}
            packs={packs}
            practice={practice}
            pending={pending}
          />
        )
      }
      if (status === 'open' && view) {
        return (
          <RemovedScreen roomCode={roomCode} onRejoin={() => actions.leave()}>
            The host may have removed you, or the room started over.
          </RemovedScreen>
        )
      }
      return (
        <StatusScreen
          roomCode={roomCode}
          busy
          title={status === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}
        >
          {status === 'reconnecting'
            ? 'Trying the game server again. This tab keeps your seat.'
            : 'Finding the room.'}
        </StatusScreen>
      )
  }
}

/** This tab has no seat in the room any more; offers a fresh join. */
function RemovedScreen({
  roomCode,
  onRejoin,
  children,
}: {
  readonly roomCode: string
  readonly onRejoin: () => Promise<void>
  readonly children: ReactNode
}) {
  return (
    <StatusScreen
      roomCode={roomCode}
      title="You’re not in this room anymore"
      actions={<Button onClick={() => void onRejoin()}>Join again</Button>}
    >
      {children}
    </StatusScreen>
  )
}

function Seated({
  room,
  view,
  me,
  roomCode,
  packs,
  practice,
  pending,
}: {
  readonly room: UseRoomResult
  readonly view: RoomView
  readonly me: MeView
  readonly roomCode: string
  readonly packs: readonly PackInfo[]
  readonly practice: boolean
  readonly pending: Pending
}) {
  const session = useMemo<RoomSession>(
    () => ({
      roomCode,
      view,
      me,
      actions: room.actions,
      canvasStore: room.canvasStore,
      serverNow: room.serverNow,
      lastFeedback: room.lastFeedback,
      pending,
      packs,
    }),
    [
      roomCode,
      view,
      me,
      room.actions,
      room.canvasStore,
      room.serverNow,
      room.lastFeedback,
      pending,
      packs,
    ],
  )

  usePracticeSetup(session, practice)

  return (
    <RoomSessionProvider value={session}>
      <MatchScreen reconnecting={room.status !== 'open'} />
    </RoomSessionProvider>
  )
}

/** Adds the practice bots once, then drops `?practice=1` from the URL. */
function usePracticeSetup(session: RoomSession, practice: boolean): void {
  const { view, actions, roomCode } = session
  useEffect(() => {
    if (!practice) return
    const plan = practiceBotPlan(view)
    if (plan && claimPracticeSetup(roomCode)) {
      for (const team of plan) void actions.addBot(team)
    }
    if (new URLSearchParams(window.location.search).has('practice')) {
      window.history.replaceState(window.history.state, '', `/play/${roomCode}`)
    }
  }, [practice, view, actions, roomCode])
}
