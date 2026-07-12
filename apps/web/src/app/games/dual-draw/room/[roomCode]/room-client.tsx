'use client'

import type { DrawingAction } from '@drawing-games/drawing-model'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'

import {
  PLAYTEST_PARTICIPANTS,
  type PlaytestParticipantId,
  type PlaytestRoomView,
} from '@/lib/playtest-room-contract'
import {
  useRoomDrawingSocket,
  type DrawingSocketSeat,
} from '@/lib/room-drawing-socket'

import { GuessComposer } from './guess-composer'
import { RoomSidebar } from './room-sidebar'
import { RoomStage } from './room-stage'
import { RoomWordPrompt } from './room-word-prompt'

interface RoomClientProps {
  readonly participantId: PlaytestParticipantId
  readonly roomCode: string
}

export function RoomClient({ participantId, roomCode }: RoomClientProps) {
  const rootRef = useRef<HTMLElement>(null)
  const [room, setRoom] = useState<PlaytestRoomView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const fixtureParticipant = PLAYTEST_PARTICIPANTS[participantId]
  const drawingSeat = useMemo<DrawingSocketSeat>(
    () => ({
      id: fixtureParticipant.id,
      displayName: fixtureParticipant.displayName,
      preferredTeam: fixtureParticipant.teamId === 'team-a' ? 'A' : 'B',
    }),
    [fixtureParticipant],
  )
  const drawingSocket = useRoomDrawingSocket(roomCode, drawingSeat)
  const projectedParticipantId = useMemo(
    () =>
      drawingSocket.viewer
        ? playtestParticipantForViewer(
            drawingSocket.viewer.team,
            drawingSocket.viewer.role,
          )
        : null,
    [drawingSocket.viewer],
  )
  const visibleRoom =
    room?.roomCode === roomCode &&
    room.participant.id === projectedParticipantId
      ? room
      : null

  useEffect(() => {
    const root = rootRef.current
    const viewport = window.visualViewport
    if (!root) return

    const keepRoomInVisualViewport = () => {
      const height = viewport?.height ?? window.innerHeight
      const offsetTop = viewport?.offsetTop ?? 0
      root.style.height = `${Math.round(height)}px`
      root.style.transform = `translateY(${Math.round(offsetTop)}px)`
    }

    keepRoomInVisualViewport()
    viewport?.addEventListener('resize', keepRoomInVisualViewport)
    viewport?.addEventListener('scroll', keepRoomInVisualViewport)
    window.addEventListener('resize', keepRoomInVisualViewport)

    return () => {
      viewport?.removeEventListener('resize', keepRoomInVisualViewport)
      viewport?.removeEventListener('scroll', keepRoomInVisualViewport)
      window.removeEventListener('resize', keepRoomInVisualViewport)
    }
  }, [])

  useEffect(() => {
    if (!projectedParticipantId) return

    const controller = new AbortController()
    let active = true

    const pollRoom = async () => {
      try {
        const nextRoom = await fetchRoom(
          roomCode,
          projectedParticipantId,
          controller.signal,
        )
        if (!active) return
        setRoom((currentRoom) =>
          !currentRoom ||
          nextRoom.roomCode !== currentRoom.roomCode ||
          nextRoom.participant.id !== currentRoom.participant.id ||
          nextRoom.revision > currentRoom.revision
            ? nextRoom
            : currentRoom,
        )
        setError(null)
      } catch (pollError) {
        if (!active || controller.signal.aborted) return
        setError(
          pollError instanceof Error ? pollError.message : 'Room unavailable',
        )
      }
    }

    void pollRoom()
    const pollTimer = window.setInterval(() => void pollRoom(), 400)

    return () => {
      active = false
      controller.abort()
      window.clearInterval(pollTimer)
    }
  }, [projectedParticipantId, reloadToken, roomCode])

  async function submitGuess(guess: string) {
    if (!projectedParticipantId) {
      throw new Error('Room identity is still reconnecting')
    }

    const response = await fetch(`/api/playtest/rooms/${roomCode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'guess',
        participantId: projectedParticipantId,
        guess,
      }),
    })
    if (!response.ok) throw new Error('Guess could not be sent')

    const nextRoom = (await response.json()) as PlaytestRoomView
    setRoom((currentRoom) =>
      !currentRoom ||
      nextRoom.roomCode !== currentRoom.roomCode ||
      nextRoom.participant.id !== currentRoom.participant.id ||
      nextRoom.revision >= currentRoom.revision
        ? nextRoom
        : currentRoom,
    )

    return {
      correct: nextRoom.recentGuesses.at(-1)?.result === 'correct',
    }
  }

  function submitDrawing(operations: readonly DrawingAction[]) {
    return drawingSocket.submitOperations(operations)
  }

  const participant = visibleRoom?.participant ?? fixtureParticipant
  const participantTeam = visibleRoom?.teams.find(
    (team) => team.id === participant.teamId,
  )
  const socketTeam =
    drawingSocket.viewer?.team === 'A'
      ? 'team-a'
      : drawingSocket.viewer?.team === 'B'
        ? 'team-b'
        : null
  const socketMatchesSeat =
    socketTeam === null || socketTeam === participant.teamId
  const effectiveRole = drawingSocket.viewer?.role ?? participant.role
  const mayDraw =
    drawingSocket.status === 'ready' &&
    socketMatchesSeat &&
    effectiveRole === 'drawer'
  const drawingError = !socketMatchesSeat
    ? 'This saved room identity belongs to the other team.'
    : drawingSocket.error
  const socketUnavailableError =
    drawingSocket.status === 'unavailable'
      ? (drawingSocket.error ?? 'Realtime drawing is unavailable.')
      : null
  const loadingError = socketUnavailableError ?? error

  return (
    <main
      ref={rootRef}
      data-participant-id={projectedParticipantId ?? participantId}
      data-room-code={roomCode}
      className="fixed inset-x-0 top-0 flex h-dvh flex-col overflow-hidden bg-[#f5f0e8] text-[#181713]"
    >
      {!visibleRoom ? (
        <section className="grid min-h-0 flex-1 place-items-center p-6 text-center">
          <div>
            <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-[#5c4cf2]">
              Room {roomCode}
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight">
              {loadingError
                ? 'Room connection paused'
                : 'Joining the playtest…'}
            </h1>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-black/55">
              {loadingError ??
                'Creating an isolated browser seat for this fake player.'}
            </p>
            {loadingError && (
              <button
                type="button"
                onClick={() => {
                  if (socketUnavailableError) window.location.reload()
                  else setReloadToken((token) => token + 1)
                }}
                className="mt-5 rounded-xl bg-[#181713] px-4 py-2.5 text-sm font-bold text-white"
              >
                Retry
              </button>
            )}
          </div>
        </section>
      ) : (
        <>
          <header className="flex shrink-0 items-center justify-between gap-3 border-b-2 border-[#181713] bg-[#f8ff80] px-3 py-2 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                href="/"
                aria-label="Back to home"
                className="grid size-11 shrink-0 place-items-center rounded-xl border-2 border-[#181713] bg-white text-lg font-black transition hover:-translate-y-0.5"
              >
                ←
              </Link>
              <div className="min-w-0">
                <p className="font-mono text-[9px] font-bold uppercase tracking-[0.17em] text-black/45">
                  Room {visibleRoom.roomCode} · multiplayer playtest
                </p>
                <h1 className="truncate text-sm font-black sm:text-base">
                  {participant.displayName} · {participantTeam?.name}{' '}
                  {effectiveRole}
                </h1>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden rounded-full border border-black/15 bg-white/55 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider sm:inline-flex">
                Round {visibleRoom.round.current}/{visibleRoom.round.total}
              </span>
              <span className="grid min-w-14 place-items-center rounded-full border-2 border-[#181713] bg-[#ff6b4a] px-3 py-1.5 font-mono text-sm font-black text-white">
                :{visibleRoom.round.secondsRemaining}
              </span>
            </div>
          </header>

          <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_minmax(0,1fr)_auto]">
            <RoomWordPrompt
              teamName={participantTeam?.name ?? 'your team'}
              word={visibleRoom.word}
            />
            <RoomStage
              teamId={participant.teamId}
              teamName={participantTeam?.name ?? 'Your team'}
              drawing={drawingSocket.teamDrawing}
              serverCanUndo={drawingSocket.canUndo}
              serverCanRedo={drawingSocket.canRedo}
              showTools={effectiveRole === 'drawer'}
              editable={mayDraw}
              socketStatus={drawingSocket.status}
              socketError={drawingError}
              opponentActive={drawingSocket.opponentActive}
              onOperations={submitDrawing}
            />
            {effectiveRole === 'guesser' ? (
              <GuessComposer onGuess={submitGuess} />
            ) : (
              <footer
                aria-label="Drawer controls"
                className="flex h-[92px] shrink-0 items-center justify-between gap-4 border-t-2 border-[#181713] bg-[#f5f0e8] px-4 sm:h-[100px] sm:px-5"
              >
                <div>
                  <p className="text-sm font-black">Drawer-only seat</p>
                  <p className="mt-1 text-xs text-black/50">
                    {drawingSocket.status === 'ready'
                      ? 'Your local ink is immediate; the room confirms each completed gesture.'
                      : 'The pad unlocks after your room identity reconnects.'}
                  </p>
                </div>
                <Link
                  href="/games/dual-draw/lab"
                  className="shrink-0 rounded-xl border-2 border-[#181713] bg-white px-3 py-2 text-xs font-bold"
                >
                  Open ink lab
                </Link>
              </footer>
            )}
            <RoomSidebar room={visibleRoom} />
          </div>
        </>
      )}
    </main>
  )
}

/**
 * Keeps the temporary REST playtest projection aligned with the role assigned
 * by the realtime room. The fake participant id is not an authentication token.
 */
function playtestParticipantForViewer(
  team: 'A' | 'B',
  role: 'drawer' | 'guesser',
): PlaytestParticipantId {
  if (team === 'A') {
    return role === 'drawer' ? 'team-a-drawer' : 'team-a-guesser'
  }

  return role === 'drawer' ? 'team-b-drawer' : 'team-b-guesser'
}

async function fetchRoom(
  roomCode: string,
  participantId: PlaytestParticipantId,
  signal: AbortSignal,
): Promise<PlaytestRoomView> {
  const query = new URLSearchParams({ participant: participantId })
  const response = await fetch(
    `/api/playtest/rooms/${roomCode}?${query.toString()}`,
    {
      cache: 'no-store',
      signal,
    },
  )
  if (!response.ok) throw new Error('The room did not answer')
  return (await response.json()) as PlaytestRoomView
}
