'use client'

import { createContext, useContext, type ReactNode } from 'react'

import { useGameViewport } from '@/components/layout/game-viewport'
import { cx } from '@/components/ui/cx'

import { useMediaQuery, useWideLayout } from '../../_lib/use-media-query'

/**
 * - `stacked`: portrait phones and narrow windows.
 * - `wide`: canvas left, full sidebar right.
 * - `wide-short`: landscape phones. The canvas pane holds only the banner
 *   and the paper; a sidebar holds the drawer's tools (narrow) or the guess
 *   dock (wider), plus the opponent tile and the feed. Nothing floats over
 *   the paper, so the drawer can reach every corner.
 */
export type PlayLayoutMode = 'stacked' | 'wide' | 'wide-short'

export interface PlayChrome {
  readonly mode: PlayLayoutMode
  /**
   * A keyboard squeezes the canvas column: banners collapse to one line so
   * the drawing keeps most of the space.
   */
  readonly compactBanner: boolean
  /**
   * The feed row and opponent tile make way for a keyboard; the guess dock's
   * status line carries the latest teammate guess and the opponent's
   * progress instead (see `LatestTeamGuess` and `OpponentChip`).
   */
  readonly feedInDock: boolean
}

const PlayLayoutContext = createContext<PlayChrome>({
  mode: 'stacked',
  compactBanner: false,
  feedInDock: false,
})

/** The layout the surrounding PlayLayout chose (for tiles and feeds). */
export function usePlayLayout(): PlayLayoutMode {
  return useContext(PlayLayoutContext).mode
}

/** Layout mode plus how much the screen is squeezed by a keyboard. */
export function usePlayChrome(): PlayChrome {
  return useContext(PlayLayoutContext)
}

const SHORT_QUERY = '(max-height: 559px)'

export interface PlayLayoutProps {
  /** Word banner (drawer) or clue banner (guessers); fixed height. */
  readonly banner: ReactNode
  /** The main 4:3 paper; it flexes and letterboxes. */
  readonly canvas: ReactNode
  /** Drawer toolbar under the canvas (in the sidebar on landscape phones). */
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
 *
 * While a keyboard (the device's or the in-app compact one) is up on a
 * phone, the layout tightens instead of shrinking the drawing to a
 * thumbnail: the banner collapses to one line and the feed row hides, its
 * news moving into the dock's status line.
 */
export function PlayLayout(props: PlayLayoutProps) {
  const wide = useWideLayout()
  const short = useMediaQuery(SHORT_QUERY)
  const { keyboardOpen, keyboardShown } = useGameViewport()
  const mode: PlayLayoutMode = !wide ? 'stacked' : short ? 'wide-short' : 'wide'
  const guessing = Boolean(props.dock)
  const chrome: PlayChrome = {
    mode,
    // Landscape phones keep the compact keys in the sidebar, so only the
    // device keyboard squeezes their canvas column.
    compactBanner:
      guessing &&
      (mode === 'stacked'
        ? keyboardShown
        : mode === 'wide-short' && keyboardOpen),
    feedInDock: guessing && keyboardShown && mode !== 'wide',
  }
  return (
    <PlayLayoutContext value={chrome}>
      {mode === 'stacked' ? (
        <Stacked {...props} chrome={chrome} />
      ) : mode === 'wide-short' ? (
        <WideShort {...props} chrome={chrome} />
      ) : (
        <Wide {...props} />
      )}
    </PlayLayoutContext>
  )
}

interface ChromeProps {
  readonly chrome: PlayChrome
}

function Stacked({
  banner,
  canvas,
  tools,
  dock,
  feed,
  opponent,
  chrome,
}: PlayLayoutProps & ChromeProps) {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      data-testid="play-layout"
      data-layout="stacked"
      data-typing={chrome.feedInDock || undefined}
    >
      {banner}
      <div
        className={cx(
          'relative min-h-0 flex-1 px-2',
          chrome.feedInDock ? 'py-1' : 'pt-2 pb-1',
        )}
      >
        {canvas}
      </div>
      {tools ? <ToolsBar>{tools}</ToolsBar> : null}
      {chrome.feedInDock ? null : (
        <div className="flex h-[5.25rem] shrink-0 gap-2 border-t-2 border-[#181713] bg-[#efe9de] px-2 py-1.5">
          <div className="flex min-w-0 flex-1 flex-col">{feed}</div>
          <div className="w-[6.75rem] shrink-0">{opponent}</div>
        </div>
      )}
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
}: PlayLayoutProps) {
  return (
    <div
      className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_19rem] xl:grid-cols-[minmax(0,1fr)_23rem]"
      data-testid="play-layout"
      data-layout="wide"
    >
      <div className="flex min-h-0 min-w-0 flex-col">
        {banner}
        <div className="relative min-h-0 flex-1 p-3">{canvas}</div>
        {tools ? <ToolsBar>{tools}</ToolsBar> : null}
        {dock ? (
          <div className="shrink-0 border-t-2 border-[#181713] pb-2">
            {dock}
          </div>
        ) : null}
      </div>
      <aside
        aria-label="Team feed and opponent"
        className="flex min-h-0 flex-col gap-3 border-l-2 border-[#181713] bg-[#efe9de] p-3"
      >
        <div className="flex min-h-0 flex-1 flex-col">{feed}</div>
        <div className="shrink-0">{opponent}</div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </aside>
    </div>
  )
}

/**
 * A guesser's landscape sidebar holds the compact keyboard, so it takes the
 * width the paper does not need. On landscape phones the 4:3 paper is limited
 * by height, which leaves slack beside it: the paper needs about
 * (layout height - banner - padding) x 4/3 + padding. Assuming a short
 * banner (4.5rem, plus 1rem padding) overestimates that, so the paper never
 * shrinks. Between 19rem and 26rem the letter keys are 26-37 px wide (31 px
 * on a 667 x 375 iPhone SE, 37 px from about 740 px wide), like a phone's
 * own keyboard. `cqw`/`cqh` are the play area under the top bar (safe-area
 * insets already excluded).
 */
const GUESSER_SIDEBAR =
  'clamp(19rem, calc(100cqw - (100cqh - 5.5rem) * 4 / 3 - 1rem), 26rem)'

/**
 * Landscape phones. The paper's pane has nothing floating over it. The
 * drawer's sidebar is narrow (tools, opponent, feed) so the paper gets most
 * of the width; a guesser's sidebar is as wide as the paper allows, for the
 * compact keyboard.
 */
function WideShort({
  banner,
  canvas,
  tools,
  dock,
  feed,
  opponent,
  chrome,
}: PlayLayoutProps & ChromeProps) {
  return (
    <div className="flex min-h-0 flex-1 [container-type:size]">
      <div
        className={cx(
          'grid min-h-0 w-full',
          dock ? null : 'grid-cols-[minmax(0,1fr)_13rem]',
        )}
        style={
          dock
            ? { gridTemplateColumns: `minmax(0, 1fr) ${GUESSER_SIDEBAR}` }
            : undefined
        }
        data-testid="play-layout"
        data-layout="wide-short"
        data-typing={chrome.feedInDock || undefined}
      >
        <div className="flex min-h-0 min-w-0 flex-col">
          {chrome.compactBanner ? null : banner}
          <div className="relative min-h-0 flex-1 p-2">{canvas}</div>
        </div>
        <aside
          aria-label={dock ? 'Guess' : 'Tools, team feed and opponent'}
          className="flex min-h-0 flex-col overflow-y-auto overscroll-contain border-l-2 border-[#181713] bg-[#efe9de]"
        >
          {/* The device keyboard leaves a landscape phone very little height:
              the one-line clue moves over the dock so the paper keeps it. */}
          {chrome.compactBanner ? banner : null}
          {tools ? (
            <div className="relative shrink-0 border-b-2 border-[#181713] bg-[#fffdf7]">
              {tools}
            </div>
          ) : null}
          {chrome.feedInDock ? null : (
            <div className="shrink-0 px-2 pt-2">{opponent}</div>
          )}
          <div className="flex min-h-10 flex-1 flex-col px-2 py-1.5">
            {feed}
          </div>
          {dock ? (
            <div className="shrink-0 border-t-2 border-[#181713]">{dock}</div>
          ) : null}
        </aside>
      </div>
    </div>
  )
}

function ToolsBar({ children }: { readonly children: ReactNode }) {
  return (
    <div className="relative shrink-0 border-t-2 border-[#181713] bg-[#fffdf7]">
      {children}
    </div>
  )
}
