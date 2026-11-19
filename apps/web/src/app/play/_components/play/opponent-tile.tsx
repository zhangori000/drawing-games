'use client'

import { TEAM_NAMES, type TeamId } from '@drawing-games/game-core'
import type { ReactNode } from 'react'

import { cx } from '@/components/ui/cx'
import { TEAM_COLORS, TEAM_SYMBOLS } from '@/components/ui/team-badge'

import { CanvasThumb, OpponentPreview } from '../shared/room-canvas'
import { usePlayLayout } from './play-layout'

export interface OpponentTileProps {
  readonly team: TeamId
  readonly canvasId: string
  readonly access: 'full' | 'preview'
  readonly drawerName: string | null
  /** Short status, e.g. "Solved!" or "4 guesses". */
  readonly status: ReactNode
  readonly done: boolean
  /** Showing the opponent's canvas in the main pane. */
  readonly watching: boolean
  readonly onToggleWatch: () => void
}

/**
 * The other team: a blurry preview while you are still playing, their real
 * canvas once your team has solved ("watch them scramble").
 */
export function OpponentTile({
  team,
  canvasId,
  access,
  drawerName,
  status,
  done,
  watching,
  onToggleWatch,
}: OpponentTileProps) {
  const mini = usePlayLayout() !== 'wide'
  const name = TEAM_NAMES[team]
  const full = access === 'full'
  const picture = full ? (
    <CanvasThumb canvasId={canvasId} label={`${name}'s drawing`} />
  ) : (
    <OpponentPreview canvasId={canvasId} label={name} />
  )

  if (mini) {
    return (
      <div
        className="relative flex h-full flex-col justify-center"
        data-testid="opponent-tile"
      >
        <div className="relative [&_figcaption]:hidden">
          {picture}
          <span
            className={cx(
              'absolute bottom-1 left-1 right-1 truncate rounded-md px-1 text-center text-[10px] font-black',
              done ? 'bg-[#1f9d72] text-white' : 'bg-white/90 text-[#181713]',
            )}
          >
            <span aria-hidden="true">{TEAM_SYMBOLS[team]} </span>
            {done ? `${name} solved` : name}
          </span>
        </div>
        {full ? (
          <button
            type="button"
            onClick={onToggleWatch}
            className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5c4cf2]/50"
            aria-label={
              watching ? 'Back to your drawing' : `Watch ${name} draw`
            }
          />
        ) : null}
      </div>
    )
  }

  return (
    <section
      aria-label={`${name}, the other team`}
      data-testid="opponent-tile"
      className="rounded-2xl border-2 border-[#181713] bg-[#fffdf7] p-2.5"
    >
      <header className="mb-2 flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1 rounded-full border-2 border-[#181713] px-2 py-0.5 text-xs font-black text-white"
          style={{ backgroundColor: TEAM_COLORS[team] }}
        >
          <span aria-hidden="true">{TEAM_SYMBOLS[team]}</span>
          {name}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-black/55">
          {drawerName ? `${drawerName} drawing` : ''}
        </span>
        <span
          className={cx(
            'shrink-0 rounded-full px-2 py-0.5 text-xs font-black',
            done ? 'bg-[#1f9d72] text-white' : 'bg-black/5',
          )}
        >
          {status}
        </span>
      </header>
      {picture}
      {full ? (
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-black/60">
            You solved it — watch {name}
          </p>
          <button
            type="button"
            onClick={onToggleWatch}
            className="min-h-11 rounded-xl border-2 border-[#181713] bg-white px-3 text-xs font-black"
          >
            {watching ? 'Back to ours' : 'Watch big'}
          </button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-black/50">
          Blurred on purpose — no peeking.
        </p>
      )}
    </section>
  )
}
