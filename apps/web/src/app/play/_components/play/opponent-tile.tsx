'use client'

import { TEAM_NAMES, type TeamId } from '@drawing-games/game-core'
import type { ReactNode } from 'react'

import { cx } from '@/components/ui/cx'
import { TEAM_COLORS, TEAM_SYMBOLS } from '@/components/ui/team-badge'

import { CanvasThumb, OpponentPreview } from '../shared/room-canvas'
import { usePlayChrome, usePlayLayout } from './play-layout'

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
  const layout = usePlayLayout()
  const name = TEAM_NAMES[team]
  const full = access === 'full'
  const picture = full ? (
    <CanvasThumb canvasId={canvasId} label={`${name}'s drawing`} />
  ) : (
    <OpponentPreview canvasId={canvasId} label={name} />
  )

  if (layout === 'wide-short') {
    // A compact row for the landscape sidebar: small picture plus status.
    return (
      <div
        className="relative flex items-center gap-2"
        data-testid="opponent-tile"
      >
        <div className="w-20 shrink-0 [&_figcaption]:hidden">{picture}</div>
        <div className="min-w-0 flex-1 text-xs">
          <p className="flex min-w-0 items-center gap-1 font-black">
            <span
              aria-hidden="true"
              className="grid size-5 shrink-0 place-items-center rounded-full border-2 border-[#181713] text-[10px] text-white"
              style={{ backgroundColor: TEAM_COLORS[team] }}
            >
              {TEAM_SYMBOLS[team]}
            </span>
            <span className="truncate">{name}</span>
          </p>
          <p
            className={cx(
              'mt-0.5 truncate font-bold',
              done ? 'text-[#1f9d72]' : 'text-black/55',
            )}
          >
            {status}
          </p>
          {full ? (
            <p className="truncate font-black text-[#5c4cf2]">
              {watching ? 'Back to ours' : 'Tap to watch'}
            </p>
          ) : null}
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

  if (layout === 'stacked') {
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

export interface OpponentChipProps {
  readonly team: TeamId
  /** Short status, e.g. "Solved!" or "4 guesses". */
  readonly status: ReactNode
  readonly done: boolean
}

/**
 * The other team's progress as a one-line chip for the guess dock's status
 * line. It only shows while a keyboard has pushed the opponent tile off a
 * phone screen (`feedInDock`), so the race stays visible while typing.
 */
export function OpponentChip({ team, status, done }: OpponentChipProps) {
  const { feedInDock } = usePlayChrome()
  if (!feedInDock) return null
  const name = TEAM_NAMES[team]
  return (
    <span
      data-testid="opponent-chip"
      className={cx(
        'inline-flex min-w-0 max-w-[45%] shrink-0 items-center gap-1 rounded-full border-2 border-[#181713] px-2 py-px text-[11px] font-black',
        done ? 'bg-[#1f9d72] text-white' : 'text-white',
      )}
      style={done ? undefined : { backgroundColor: TEAM_COLORS[team] }}
    >
      <span aria-hidden="true">{TEAM_SYMBOLS[team]}</span>
      <span className="sr-only">{name}:</span>
      <span className="truncate">{status}</span>
    </span>
  )
}
