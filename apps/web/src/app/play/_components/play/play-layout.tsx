'use client'

import { createContext, useContext, type ReactNode } from 'react'

import { useMediaQuery, useWideLayout } from '../../_lib/use-media-query'

/**
 * - `stacked`: portrait phones and narrow windows.
 * - `wide`: canvas left, full sidebar right.
 * - `wide-short`: landscape phones; the sidebar holds the guess dock (or the
 *   drawer's feed), and the opponent tile floats over the canvas pane.
 */
export type PlayLayoutMode = 'stacked' | 'wide' | 'wide-short'

const PlayLayoutContext = createContext<PlayLayoutMode>('stacked')

/** The layout the surrounding PlayLayout chose (for tiles and feeds). */
export function usePlayLayout(): PlayLayoutMode {
  return useContext(PlayLayoutContext)
}

const SHORT_QUERY = '(max-height: 559px)'

export interface PlayLayoutProps {
  /** Word banner (drawer) or clue banner (guessers); fixed height. */
  readonly banner: ReactNode
  /** The main 4:3 paper; it flexes and letterboxes. */
  readonly canvas: ReactNode
  /** Drawer toolbar under the canvas. */
  readonly tools?: ReactNode
  /** Guess dock (with the compact keyboard) at the very bottom. */
  readonly dock?: ReactNode
  readonly feed: ReactNode
  readonly opponent: ReactNode
  /** Extra sidebar content on roomy wide screens (scoreboard). */
  readonly aside?: ReactNode
}

/**
 * The drawing/guessing screen skeleton. Portrait phones stack banner,
 * canvas, a short feed beside a mini opponent tile, and the dock; wide
 * screens put the canvas left and a sidebar right. Every region except the
 * canvas has a fixed size, so guesses and feedback never move the drawing.
 */
export function PlayLayout(props: PlayLayoutProps) {
  const wide = useWideLayout()
  const short = useMediaQuery(SHORT_QUERY)
  const mode: PlayLayoutMode = !wide ? 'stacked' : short ? 'wide-short' : 'wide'
  return (
    <PlayLayoutContext value={mode}>
      {mode === 'stacked' ? (
        <Stacked {...props} />
      ) : (
        <Wide {...props} short={mode === 'wide-short'} />
      )}
    </PlayLayoutContext>
  )
}

function Stacked({
  banner,
  canvas,
  tools,
  dock,
  feed,
  opponent,
}: PlayLayoutProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {banner}
      <div className="relative min-h-0 flex-1 px-2 pt-2 pb-1">{canvas}</div>
      {tools ? <ToolsBar>{tools}</ToolsBar> : null}
      <div className="flex h-[5.25rem] shrink-0 gap-2 border-t-2 border-[#181713] bg-[#efe9de] px-2 py-1.5">
        <div className="flex min-w-0 flex-1 flex-col">{feed}</div>
        <div className="w-[6.75rem] shrink-0">{opponent}</div>
      </div>
      {dock ? (
        <div className="shrink-0 border-t-2 border-[#181713]">{dock}</div>
      ) : null}
    </div>
  )
}

function Wide({
  banner,
  canvas,
  tools,
  dock,
  feed,
  opponent,
  aside,
  short,
}: PlayLayoutProps & { readonly short: boolean }) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_19rem] xl:grid-cols-[minmax(0,1fr)_23rem]">
      <div className="flex min-h-0 min-w-0 flex-col">
        {banner}
        <div className="relative min-h-0 flex-1 p-3">
          {canvas}
          {short ? (
            <div className="absolute right-2 top-2 z-10 w-24">{opponent}</div>
          ) : null}
        </div>
        {tools ? <ToolsBar>{tools}</ToolsBar> : null}
        {dock && !short ? (
          <div className="shrink-0 border-t-2 border-[#181713] pb-2">
            {dock}
          </div>
        ) : null}
      </div>
      {short && dock ? (
        // Landscape phones: the dock (and compact keyboard) gets the whole
        // sidebar; it scrolls rather than clip if the screen is very short.
        <aside
          aria-label="Guess"
          className="min-h-0 overflow-y-auto overscroll-contain border-l-2 border-[#181713] bg-[#efe9de]"
        >
          {dock}
        </aside>
      ) : (
        <aside
          aria-label="Team feed and opponent"
          className="flex min-h-0 flex-col gap-3 border-l-2 border-[#181713] bg-[#efe9de] p-3"
        >
          <div className="flex min-h-0 flex-1 flex-col">{feed}</div>
          {short ? null : <div className="shrink-0">{opponent}</div>}
          {aside && !short ? <div className="shrink-0">{aside}</div> : null}
        </aside>
      )}
    </div>
  )
}

function ToolsBar({ children }: { readonly children: ReactNode }) {
  return (
    <div className="shrink-0 border-t-2 border-[#181713] bg-[#fffdf7]">
      {children}
    </div>
  )
}
