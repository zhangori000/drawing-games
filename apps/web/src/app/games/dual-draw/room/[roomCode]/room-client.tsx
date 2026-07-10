'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import {
  PLAYTEST_PARTICIPANTS,
  type PlaytestParticipantId,
  type PlaytestRoomView,
} from '@/lib/playtest-room-contract'

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
    const controller = new AbortController()
    let active = true

    const pollRoom = async () => {
      try {
        const nextRoom = await fetchRoom(
          roomCode,
          participantId,
          controller.signal,
        )
        if (!active) return
        setRoom((currentRoom) =>
          !currentRoom || nextRoom.revision >= currentRoom.revision
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
  }, [participantId, reloadToken, roomCode])

  async function submitGuess(guess: string) {
    const response = await fetch(`/api/playtest/rooms/${roomCode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'guess', participantId, guess }),
    })
    if (!response.ok) throw new Error('Guess could not be sent')

    const nextRoom = (await response.json()) as PlaytestRoomView
    setRoom((currentRoom) =>
      !currentRoom || nextRoom.revision >= currentRoom.revision
        ? nextRoom
        : currentRoom,
    )

    return {
      correct: nextRoom.recentGuesses.at(-1)?.result === 'correct',
    }
  }

  const participant = room?.participant ?? PLAYTEST_PARTICIPANTS[participantId]
  const participantTeam = room?.teams.find(
    (team) => team.id === participant.teamId,
  )

  return (
    <main
      ref={rootRef}
      data-participant-id={participantId}
      data-room-code={roomCode}
      className="fixed inset-x-0 top-0 flex h-dvh flex-col overflow-hidden bg-[#f5f0e8] text-[#181713]"
    >
      {!room ? (
        <section className="grid min-h-0 flex-1 place-items-center p-6 text-center">
          <div>
            <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-[#5c4cf2]">
              Room {roomCode}
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight">
              {error ? 'Room connection paused' : 'Joining the playtest…'}
            </h1>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-black/55">
              {error ??
                'Creating an isolated browser seat for this fake player.'}
            </p>
            {error && (
              <button
                type="button"
                onClick={() => setReloadToken((token) => token + 1)}
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
                  Room {room.roomCode} · multiplayer playtest
                </p>
                <h1 className="truncate text-sm font-black sm:text-base">
                  {participant.displayName} · {participantTeam?.name}{' '}
                  {participant.role}
                </h1>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden rounded-full border border-black/15 bg-white/55 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider sm:inline-flex">
                Round {room.round.current}/{room.round.total}
              </span>
              <span className="grid min-w-14 place-items-center rounded-full border-2 border-[#181713] bg-[#ff6b4a] px-3 py-1.5 font-mono text-sm font-black text-white">
                :{room.round.secondsRemaining}
              </span>
            </div>
          </header>

          <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_minmax(0,1fr)_auto]">
            <RoomWordPrompt
              teamName={participantTeam?.name ?? 'your team'}
              word={room.word}
            />
            <RoomStage
              teamId={participant.teamId}
              teamName={participantTeam?.name ?? 'Your team'}
            />
            {participant.role === 'guesser' ? (
              <GuessComposer onGuess={submitGuess} />
            ) : (
              <footer
                aria-label="Drawer controls"
                className="flex h-[92px] shrink-0 items-center justify-between gap-4 border-t-2 border-[#181713] bg-[#f5f0e8] px-4 sm:h-[100px] sm:px-5"
              >
                <div>
                  <p className="text-sm font-black">Drawer-only seat</p>
                  <p className="mt-1 text-xs text-black/50">
                    Guess controls are never rendered for this participant.
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
            <RoomSidebar room={room} />
          </div>
        </>
      )}
    </main>
  )
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
