'use client'

import { TEAM_IDS, TEAM_NAMES } from '@drawing-games/game-core'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useSyncExternalStore } from 'react'

import { useGameViewport } from '@/components/layout/game-viewport'
import { Button } from '@/components/ui/button'
import { copyText } from '@/components/ui/copy-button'
import { Countdown } from '@/components/ui/countdown'
import { cx } from '@/components/ui/cx'
import { IconButton } from '@/components/ui/icon-button'
import { Modal } from '@/components/ui/modal'
import { TEAM_COLORS, TEAM_SYMBOLS } from '@/components/ui/team-badge'

import {
  leaveRoomDescription,
  phaseLabel,
  shortPhaseLabel,
  timerLabel,
} from '../_lib/format'
import { useTypingOnShortLandscape } from './play/play-layout'
import { useRoomSession } from './room-session'

const noopSubscribe = () => () => {}

/** The invite link everyone shares: this site's origin + /play/CODE. */
export function useInviteLink(roomCode: string): string {
  const origin = useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => '',
  )
  return `${origin}/play/${roomCode}`
}

/**
 * Persistent match header: leave, room code (tap to copy the invite link),
 * round or phase, the countdown, and both scores. While the device keyboard
 * is open it slims from 56 to 44 px so the drawing keeps more of the screen.
 * A landscape phone typing a guess has only about 150 px, so there it steps
 * aside until the keyboard closes; the clue banner shows the clock.
 */
export function TopBar() {
  const { view, roomCode, serverNow } = useRoomSession()
  const [confirmLeave, setConfirmLeave] = useState(false)
  const slim = useGameViewport().keyboardOpen
  const typingOnShortLandscape = useTypingOnShortLandscape()
  const hidden =
    typingOnShortLandscape &&
    (view.phase === 'drawing' || view.phase === 'showdown')

  return (
    <header
      data-testid="top-bar"
      className={cx(
        'relative z-10 flex shrink-0 items-center gap-1.5 border-b-2 border-[#181713] bg-[#fffdf7] px-2 sm:gap-3 sm:px-4',
        slim ? 'h-11' : 'h-14',
        hidden && 'hidden',
      )}
    >
      <IconButton
        label="Leave room"
        onClick={() => setConfirmLeave(true)}
        className={slim ? 'size-9!' : undefined}
      >
        <span aria-hidden="true" className="text-xl font-black leading-none">
          ←
        </span>
      </IconButton>
      <InviteChip roomCode={roomCode} slim={slim} />
      <p className="min-w-0 truncate text-xs font-black sm:text-sm">
        <span className="sm:hidden">{shortPhaseLabel(view)}</span>
        <span className="hidden sm:inline">{phaseLabel(view)}</span>
      </p>
      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        <Countdown
          deadlineAtMs={view.phaseDeadlineAtMs}
          serverNow={serverNow}
          label={timerLabel(view)}
          className={slim ? 'py-1!' : undefined}
        />
        <Scores />
      </div>
      <LeaveDialog open={confirmLeave} onClose={() => setConfirmLeave(false)} />
    </header>
  )
}

function Scores() {
  const { view } = useRoomSession()
  return (
    <div
      role="group"
      aria-label="Scores"
      className="flex items-center gap-1"
      data-testid="top-scores"
    >
      {TEAM_IDS.map((team) => (
        <span
          key={team}
          className="inline-flex min-w-12 items-center justify-center gap-1 rounded-full border-2 border-[#181713] px-2 py-1 font-mono text-sm font-black tabular-nums text-white"
          style={{ backgroundColor: TEAM_COLORS[team] }}
        >
          <span aria-hidden="true">{TEAM_SYMBOLS[team]}</span>
          <span className="sr-only">{TEAM_NAMES[team]}</span>
          {view.teams[team].score}
        </span>
      ))}
    </div>
  )
}

function InviteChip({
  roomCode,
  slim,
}: {
  readonly roomCode: string
  readonly slim: boolean
}) {
  const link = useInviteLink(roomCode)
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  useEffect(() => {
    if (state === 'idle') return
    const id = window.setTimeout(() => setState('idle'), 1600)
    return () => window.clearTimeout(id)
  }, [state])

  return (
    <button
      type="button"
      onClick={async () =>
        setState((await copyText(link)) ? 'copied' : 'failed')
      }
      aria-label={`Room ${roomCode}. Copy invite link`}
      title="Copy invite link"
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-xl border-2 border-[#181713] px-2.5 font-mono text-sm font-black tracking-[0.12em] transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5c4cf2]/35 sm:px-3',
        slim ? 'min-h-9' : 'min-h-11',
        state === 'copied'
          ? 'bg-[#1f9d72] text-white'
          : 'bg-white hover:bg-[#f8ff80]',
      )}
    >
      <span data-testid="room-code">{roomCode}</span>
      <span
        aria-live="polite"
        className="font-sans text-[11px] font-bold tracking-normal opacity-70"
      >
        {state === 'copied' ? (
          'Copied!'
        ) : state === 'failed' ? (
          'Copy failed'
        ) : (
          <span className="hidden sm:inline">Copy link</span>
        )}
      </span>
    </button>
  )
}

function LeaveDialog({
  open,
  onClose,
}: {
  readonly open: boolean
  readonly onClose: () => void
}) {
  const { view, actions, pending } = useRoomSession()
  const router = useRouter()

  const leave = () =>
    pending.run('leave', async () => {
      await actions.leave()
      router.push('/')
    })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Leave the room?"
      description={leaveRoomDescription(view)}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Stay
          </Button>
          <Button
            variant="accent"
            loading={pending.has('leave')}
            onClick={() => void leave()}
          >
            Leave room
          </Button>
        </>
      }
    />
  )
}
