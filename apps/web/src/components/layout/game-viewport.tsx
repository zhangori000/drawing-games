'use client'

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'

import { cx } from '../ui/cx'
import { isEditableElement } from './editable'

export interface GameViewportState {
  /** An on-screen keyboard is (very likely) covering part of the screen. */
  readonly keyboardOpen: boolean
  /** Visible height in CSS pixels (0 before the first measurement). */
  readonly height: number
}

const GameViewportContext = createContext<GameViewportState>({
  keyboardOpen: false,
  height: 0,
})

export function useGameViewport(): GameViewportState {
  return useContext(GameViewportContext)
}

/** The visible area shrinking below this share of its tallest size means a keyboard. */
const KEYBOARD_HEIGHT_RATIO = 0.8
const DOUBLE_TAP_MS = 300
const INTERACTIVE_SELECTOR =
  'button, a, input, textarea, select, label, summary, canvas, [role="button"], [contenteditable="true"]'

export interface GameViewportProps {
  readonly children: ReactNode
  readonly className?: string
}

/**
 * Full-screen play container pinned to the *visual* viewport, so opening a
 * phone keyboard shrinks the layout instead of scrolling the drawing away.
 * While mounted the document never scrolls, double-tap and Safari gesture
 * zoom are suppressed inside it, and safe-area insets are respected.
 *
 * The route should also use `gameViewport` (viewport-fit=cover,
 * interactive-widget=resizes-content) from `./game-viewport-meta`.
 */
export function GameViewport({ children, className }: GameViewportProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<GameViewportState>({
    keyboardOpen: false,
    height: 0,
  })

  useVisualViewportPin(rootRef, setState)
  useDocumentScrollLock()
  useZoomGuards(rootRef)

  return (
    <GameViewportContext value={state}>
      <div
        ref={rootRef}
        data-keyboard-open={state.keyboardOpen || undefined}
        className={cx(
          'fixed inset-x-0 top-0 flex h-dvh flex-col overflow-hidden bg-[#f5f0e8] text-[#181713] will-change-transform',
          className,
        )}
        style={{
          touchAction: 'manipulation',
          overscrollBehavior: 'none',
          paddingTop: 'env(safe-area-inset-top)',
          paddingRight: 'env(safe-area-inset-right)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
        }}
      >
        {children}
      </div>
    </GameViewportContext>
  )
}

function useVisualViewportPin(
  rootRef: RefObject<HTMLDivElement | null>,
  setState: (
    update: (previous: GameViewportState) => GameViewportState,
  ) => void,
): void {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const viewport = window.visualViewport
    let baselineWidth = window.innerWidth
    let baselineHeight = 0
    let frame = 0

    const measure = () => {
      frame = 0
      const height = Math.round(viewport?.height ?? window.innerHeight)
      const offsetTop = Math.round(viewport?.offsetTop ?? 0)
      root.style.height = `${height}px`
      root.style.transform = offsetTop
        ? `translate3d(0, ${offsetTop}px, 0)`
        : ''

      // Track the tallest height per width: rotation resets the baseline.
      if (window.innerWidth !== baselineWidth) {
        baselineWidth = window.innerWidth
        baselineHeight = height
      } else {
        baselineHeight = Math.max(baselineHeight, height)
      }
      const keyboardOpen =
        isEditableElement(document.activeElement) &&
        height < baselineHeight * KEYBOARD_HEIGHT_RATIO

      setState((previous) =>
        previous.height === height && previous.keyboardOpen === keyboardOpen
          ? previous
          : { height, keyboardOpen },
      )
    }
    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(measure)
    }

    schedule()
    viewport?.addEventListener('resize', schedule)
    viewport?.addEventListener('scroll', schedule)
    window.addEventListener('resize', schedule)
    document.addEventListener('focusin', schedule)
    document.addEventListener('focusout', schedule)
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame)
      viewport?.removeEventListener('resize', schedule)
      viewport?.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      document.removeEventListener('focusin', schedule)
      document.removeEventListener('focusout', schedule)
    }
  }, [rootRef, setState])
}

function useDocumentScrollLock(): void {
  useEffect(() => {
    const targets = [document.documentElement, document.body]
    const previous = targets.map((element) => ({
      overflow: element.style.overflow,
      overscrollBehavior: element.style.overscrollBehavior,
    }))
    for (const element of targets) {
      element.style.overflow = 'hidden'
      element.style.overscrollBehavior = 'none'
    }
    return () => {
      targets.forEach((element, index) => {
        element.style.overflow = previous[index]?.overflow ?? ''
        element.style.overscrollBehavior =
          previous[index]?.overscrollBehavior ?? ''
      })
    }
  }, [])
}

function useZoomGuards(rootRef: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    // iOS Safari pinch/rotate gestures (non-standard events).
    const cancelGesture = (event: Event) => {
      if (event.target instanceof Node && root.contains(event.target)) {
        event.preventDefault()
      }
    }

    // Belt and braces for browsers that ignore touch-action: manipulation.
    // Only non-interactive targets are guarded so fast double taps on
    // buttons and keys still click twice.
    let lastTouchEndAt = 0
    const guardDoubleTap = (event: TouchEvent) => {
      const now = event.timeStamp
      const target = event.target
      const interactive =
        target instanceof Element && target.closest(INTERACTIVE_SELECTOR)
      if (!interactive && now - lastTouchEndAt < DOUBLE_TAP_MS) {
        event.preventDefault()
      }
      lastTouchEndAt = now
    }

    const gestureEvents = ['gesturestart', 'gesturechange', 'gestureend']
    for (const name of gestureEvents) {
      document.addEventListener(name, cancelGesture, { passive: false })
    }
    root.addEventListener('touchend', guardDoubleTap, { passive: false })
    return () => {
      for (const name of gestureEvents) {
        document.removeEventListener(name, cancelGesture)
      }
      root.removeEventListener('touchend', guardDoubleTap)
    }
  }, [rootRef])
}
