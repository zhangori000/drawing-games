'use client'

import { TEAM_NAMES, type RoomView } from '@drawing-games/game-core'

import { Spinner } from '@/components/ui/button'

import { phaseAnnouncement } from '../_lib/format'
import { DraftScreen } from './draft/draft-screen'
import { FinalScreen } from './final/final-screen'
import { LobbyScreen } from './lobby/lobby-screen'
import { DrawingScreen } from './play/drawing-screen'
import { ShowdownScreen } from './play/showdown-screen'
import { ResultsScreen } from './results/results-screen'
import { useRoomSession } from './room-session'
import { TopBar } from './top-bar'

/** A seated player's screen: the top bar plus whatever phase the room is in. */
export function MatchScreen({
  reconnecting,
}: {
  readonly reconnecting: boolean
}) {
  const { view, roomCode } = useRoomSession()
  return (
    <>
      <TopBar />
      <div
        className="relative flex min-h-0 flex-1 flex-col"
        data-phase={view.phase}
      >
        <h1 className="sr-only">Dual Draw room {roomCode}</h1>
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {announcement(view)}
        </p>
        {reconnecting ? <ReconnectingBanner /> : null}
        <PhaseScreen view={view} />
      </div>
    </>
  )
}

function PhaseScreen({ view }: { readonly view: RoomView }) {
  switch (view.phase) {
    case 'lobby':
      return <LobbyScreen />
    case 'word-draft':
      return view.round ? <DraftScreen round={view.round} /> : <Waiting />
    case 'drawing':
      return view.round ? <DrawingScreen round={view.round} /> : <Waiting />
    case 'round-results':
      return view.results ? (
        <ResultsScreen results={view.results} />
      ) : (
        <Waiting />
      )
    case 'showdown':
      return view.showdown ? (
        <ShowdownScreen showdown={view.showdown} />
      ) : (
        <Waiting />
      )
    case 'stats':
      return view.final ? <FinalScreen final={view.final} /> : <Waiting />
  }
}

/** Phase changes and solves, for screen readers. */
function announcement(view: RoomView): string {
  const parts = [phaseAnnouncement(view)]
  const mine = view.round?.mine
  const opponent = view.round?.opponent
  if (mine?.solution) {
    parts.push(
      `${mine.solution.guesserName} solved it for your team: ${mine.solution.points} points.`,
    )
  }
  if (opponent?.solved)
    parts.push(`${TEAM_NAMES[opponent.team]} solved their word.`)
  return parts.join(' ')
}

/** Overlays the top of the screen so the layout (and canvas) never shifts. */
function ReconnectingBanner() {
  return (
    <div
      role="status"
      className="pointer-events-none absolute inset-x-0 top-2 z-30 flex justify-center px-3"
    >
      <p className="flex items-center gap-2 rounded-full border-2 border-[#181713] bg-[#f8ff80] px-4 py-2 text-sm font-black shadow-[3px_3px_0_#181713]">
        <Spinner />
        Reconnecting… your seat is saved
      </p>
    </div>
  )
}

function Waiting() {
  return (
    <div className="grid flex-1 place-items-center text-sm font-semibold text-black/55">
      <p className="flex items-center gap-2">
        <Spinner /> Waiting for the room…
      </p>
    </div>
  )
}
