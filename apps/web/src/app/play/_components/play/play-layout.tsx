'use client'

import {
  createContext,
  useContext,
  type CSSProperties,
  type ReactNode,
} from 'react'

import { useGameViewport } from '@/components/layout/game-viewport'
import { cx } from '@/components/ui/cx'

import {
  playLayoutMode,
  SHORT_LAYOUT_MAX_HEIGHT,
  type PlayLayoutMode,
} from '../../_lib/layout-mode'
import { useMediaQuery, useWideLayout } from '../../_lib/use-media-query'

export type { PlayLayoutMode }

export interface PlayChrome {
  readonly mode: PlayLayoutMode
  /**
   * A keyboard squeezes the canvas column: banners collapse to one line so
   * the drawing keeps most of the space.
   */
  readonly compactBanner: boolean
  /**
   * The opponent tile makes way for a keyboard; the guess dock's status line
   * shows the opponent's progress instead (`OpponentChip`).
   */
  readonly opponentInDock: boolean
  /**
   * The team feed makes way for a keyboard; the guess dock's status line
   * shows the newest teammate guess instead (`LatestTeamGuess`).
   */
  readonly feedInDock: boolean
  /**
   * A landscape phone with its keyboard up hides the top bar (see
   * `useTypingOnShortLandscape`): the one-line banner carries the clock.
   */
  readonly timerInBanner: boolean
}

const PlayLayoutContext = createContext<PlayChrome>({
  mode: 'stacked',
  compactBanner: false,
  opponentInDock: false,
  feedInDock: false,
  timerInBanner: false,
})

/** The layout the surrounding PlayLayout chose (for tiles and feeds). */
export function usePlayLayout(): PlayLayoutMode {
  return useContext(PlayLayoutContext).mode
}

/** Layout mode plus how much the screen is squeezed by a keyboard. */
export function usePlayChrome(): PlayChrome {
  return useContext(PlayLayoutContext)
}

const SHORT_QUERY = `(max-height: ${SHORT_LAYOUT_MAX_HEIGHT}px)`
const COARSE_QUERY = '(pointer: coarse)'

/**
 * The play layout for this screen. It is decided on the keyboard-closed
 * height (`GameViewport`'s `layoutHeight`), so a device keyboard opening
 * never switches layouts; rotating or resizing the window does. Media
 * queries stand in until `GameViewport` has measured.
 */
export function usePlayLayoutMode(): PlayLayoutMode {
  const { width, layoutHeight } = useGameViewport()
  const coarse = useMediaQuery(COARSE_QUERY)
  const wideQuery = useWideLayout()
  const shortQuery = useMediaQuery(SHORT_QUERY)
  if (width > 0 && layoutHeight > 0) {
    return playLayoutMode(width, layoutHeight, coarse)
  }
  return !wideQuery ? 'stacked' : shortQuery ? 'wide-short' : 'wide'
}

/**
 * A landscape phone with the device keyboard up has about 150 px of
 * screen. The top bar steps aside (the clue banner shows the clock), so the
 * guess box, its feedback, the clue and the drawing all fit.
 */
export function useTypingOnShortLandscape(): boolean {
  const mode = usePlayLayoutMode()
  return useGameViewport().keyboardOpen && mode === 'wide-short'
}

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
 * With the device keyboard up the banner moves into the sidebar and no keys
 * are drawn there, so the paper needs only (height - padding) x 4/3.
 */
const TYPING_SIDEBAR =
  'clamp(16rem, calc(100cqw - (100cqh - 1rem) * 4 / 3 - 1rem), 26rem)'

/**
 * The landscape drawer's sidebar: tools, opponent and feed. 17rem holds six
 * 40 px color swatches per row (with the panel's padding and border). The
 * paper is limited by height on landscape phones, so this width costs it
 * nothing: 667 x 375 and 568 x 320 phones keep the same paper size.
 */
const DRAWER_SIDEBAR = '17rem'

/**
 * Where each region sits, per layout. The regions are always the same
 * elements in the same order (pane, tools, side, dock); only this grid
 * changes. Changing layout (rotating a phone, a window resize) therefore
 * never rebuilds the canvas or the guess dock: a half-typed guess, its
 * focus and the phone keyboard all stay.
 */
function gridFor(
  mode: PlayLayoutMode,
  guessing: boolean,
  typing: boolean,
): CSSProperties {
  switch (mode) {
    case 'stacked':
      return {
        gridTemplateColumns: 'minmax(0, 1fr)',
        gridTemplateRows: 'minmax(0, 1fr) auto auto auto',
        gridTemplateAreas: '"pane" "tools" "side" "dock"',
      }
    case 'wide':
      return {
        gridTemplateColumns: 'minmax(0, 1fr) var(--play-sidebar)',
        gridTemplateRows: 'minmax(0, 1fr) auto auto',
        gridTemplateAreas: '"pane side" "tools side" "dock side"',
      }
    case 'wide-short':
      return typing
        ? {
            // The guess box and its feedback first, so they are never below
            // the fold; the one-line clue under them.
            gridTemplateColumns: `minmax(0, 1fr) ${TYPING_SIDEBAR}`,
            gridTemplateRows: 'auto minmax(0, 1fr)',
            gridTemplateAreas: '"pane dock" "pane side"',
          }
        : {
            gridTemplateColumns: `minmax(0, 1fr) ${guessing ? GUESSER_SIDEBAR : DRAWER_SIDEBAR}`,
            gridTemplateRows: 'auto minmax(0, 1fr) auto',
            gridTemplateAreas: '"pane tools" "pane side" "pane dock"',
          }
  }
}

/**
 * The drawing/guessing screen skeleton. Portrait phones stack banner,
 * canvas, a short feed beside a mini opponent tile, and the dock; wide
 * screens put the canvas left and a sidebar right; landscape phones put
 * everything but the paper in a sidebar. Every region except the canvas has
 * a fixed size, so guesses and feedback never move the drawing.
 *
 * While a keyboard (the device's or the in-app compact one) is up on a
 * phone, the layout tightens instead of shrinking the drawing to a
 * thumbnail: the banner collapses to one line and the feed row hides, its
 * news moving into the dock's status line. On a landscape phone with the
 * device keyboard (about 150 px of screen) the top bar hides too, and the
 * sidebar holds just the guess box, its feedback and the one-line clue.
 */
export function PlayLayout(props: PlayLayoutProps) {
  const { banner, canvas, tools, dock, feed, opponent, aside } = props
  const mode = usePlayLayoutMode()
  const { keyboardOpen, keyboardShown } = useGameViewport()
  const guessing = Boolean(dock)
  // Landscape phones keep the compact keys in the sidebar, so only the
  // device keyboard squeezes their canvas column.
  const typing = guessing && keyboardOpen && mode === 'wide-short'
  const chrome: PlayChrome = {
    mode,
    compactBanner:
      guessing && (mode === 'stacked' ? keyboardShown : keyboardOpen),
    opponentInDock: guessing && keyboardShown && mode !== 'wide',
    // A landscape sidebar keeps the feed beside the compact keys; only the
    // device keyboard leaves it no room.
    feedInDock: mode === 'stacked' ? guessing && keyboardShown : typing,
    timerInBanner: typing,
  }
  const bannerInSide = mode === 'wide-short' && chrome.compactBanner
  const showFeed = !chrome.feedInDock
  const showOpponent = !chrome.opponentInDock
  const showSide =
    mode === 'stacked' ? showFeed : bannerInSide || showFeed || showOpponent

  return (
    <PlayLayoutContext value={chrome}>
      {/* A size container in every layout (not only the one using `cq*`
          units), so the element tree never changes with the layout. */}
      <div className="flex min-h-0 flex-1 [container-type:size]">
        <div
          className="grid min-h-0 w-full [--play-sidebar:19rem] xl:[--play-sidebar:23rem]"
          style={gridFor(mode, guessing, typing)}
          data-testid="play-layout"
          data-layout={mode}
          data-typing={chrome.feedInDock || chrome.opponentInDock || undefined}
        >
          <div
            className="flex min-h-0 min-w-0 flex-col"
            style={{ gridArea: 'pane' }}
          >
            {bannerInSide ? null : banner}
            <div
              className={cx(
                'relative min-h-0 flex-1',
                mode === 'stacked'
                  ? cx('px-2', chrome.compactBanner ? 'py-1' : 'pt-2 pb-1')
                  : mode === 'wide'
                    ? 'p-3'
                    : 'p-2',
              )}
            >
              {canvas}
            </div>
          </div>
          {tools ? (
            <div
              className={cx(
                'relative min-w-0 bg-[#fffdf7]',
                mode === 'wide-short'
                  ? 'border-b-2 border-l-2 border-[#181713]'
                  : 'border-t-2 border-[#181713]',
              )}
              style={{ gridArea: 'tools' }}
            >
              {tools}
            </div>
          ) : null}
          {showSide ? (
            <aside
              aria-label={
                mode === 'wide-short' && guessing
                  ? 'Clue, team feed and opponent'
                  : 'Team feed and opponent'
              }
              className={cx(
                'flex min-h-0 min-w-0 bg-[#efe9de]',
                mode === 'stacked'
                  ? 'h-[5.25rem] gap-2 border-t-2 border-[#181713] px-2 py-1.5'
                  : mode === 'wide'
                    ? 'flex-col gap-3 overflow-y-auto overscroll-contain border-l-2 border-[#181713] p-3'
                    : 'flex-col overflow-y-auto overscroll-contain border-l-2 border-[#181713]',
              )}
              style={{ gridArea: 'side' }}
            >
              {/* The device keyboard leaves a landscape phone very little
                  height: the one-line clue moves beside the paper. */}
              {bannerInSide ? banner : null}
              {showFeed ? (
                <div
                  className={cx(
                    'flex min-w-0 flex-col',
                    mode === 'wide-short'
                      ? 'order-1 min-h-10 flex-1 px-2 py-1.5'
                      : mode === 'wide'
                        ? 'min-h-24 flex-1'
                        : 'min-h-0 flex-1',
                  )}
                >
                  {feed}
                </div>
              ) : null}
              {showOpponent ? (
                <div
                  className={cx(
                    'shrink-0',
                    mode === 'stacked' && 'w-[6.75rem]',
                    mode === 'wide-short' && 'px-2 pt-2',
                    mode === 'stacked' && 'h-full',
                  )}
                >
                  {opponent}
                </div>
              ) : null}
              {/* The scores are in the top bar too: while a tablet's keyboard
                  is up the team feed gets their room. */}
              {aside && mode === 'wide' && !chrome.compactBanner ? (
                <div className="shrink-0">{aside}</div>
              ) : null}
            </aside>
          ) : null}
          {dock ? (
            <div
              className={cx(
                'min-w-0 shrink-0 border-[#181713]',
                mode === 'wide-short'
                  ? cx('border-l-2', typing ? 'border-b-2' : 'border-t-2')
                  : 'border-t-2',
                mode === 'wide' && 'pb-2',
              )}
              style={{ gridArea: 'dock' }}
            >
              {dock}
            </div>
          ) : null}
        </div>
      </div>
    </PlayLayoutContext>
  )
}
