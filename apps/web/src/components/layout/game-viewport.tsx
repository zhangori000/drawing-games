'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'

import { cx } from '../ui/cx'
import { isEditableElement } from './editable'

export interface GameViewportState {
  /** The device's on-screen keyboard is (very likely) covering the screen. */
  readonly keyboardOpen: boolean
  /** An in-app keyboard (the compact guess keyboard) is on screen. */
  readonly inAppKeyboard: boolean
  /** Either keyboard takes part of the screen: layouts should tighten up. */
  readonly keyboardShown: boolean
  /** Visible height in CSS pixels (0 before the first measurement). */
  readonly height: number
  /** Viewport width in CSS pixels (0 before the first measurement). */
  readonly width: number
  /**
   * The height to plan a layout for: the visible height, except while the
   * device keyboard is open, when it is the keyboard-closed height for this
   * width. A keyboard opening (on browsers that shrink the layout viewport
   * for it, or a desktop window resized while typing) therefore never
   * switches a screen to another layout, which would rebuild its inputs and
   * close the keyboard again. 0 before the first measurement.
   */
  readonly layoutHeight: number
}

interface MeasuredViewport {
  readonly keyboardOpen: boolean
  readonly height: number
  readonly width: number
  readonly layoutHeight: number
}

const GameViewportContext = createContext<GameViewportState>({
  keyboardOpen: false,
  inAppKeyboard: false,
  keyboardShown: false,
  height: 0,
  width: 0,
  layoutHeight: 0,
})

/** Registers one on-screen in-app keyboard; returns its unregister. */
const InAppKeyboardContext = createContext<() => () => void>(() => () => {})

export function useGameViewport(): GameViewportState {
  return useContext(GameViewportContext)
}

/**
 * Tells the surrounding `GameViewport` that an in-app keyboard is showing,
 * so the play layout can make room for it the same way it does for the
 * device keyboard. A no-op outside a `GameViewport`.
 */
export function useInAppKeyboard(shown: boolean): void {
  const register = useContext(InAppKeyboardContext)
  // Layout effect: the layout tightens in the same frame the keys appear.
  useLayoutEffect(() => {
    if (!shown) return
    return register()
  }, [shown, register])
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

/** Above this visual-viewport scale the page is zoomed (not a keyboard). */
const ZOOMED_SCALE = 1.01

/**
 * Full-screen play container pinned to the *visual* viewport, so opening a
 * phone keyboard shrinks the layout instead of scrolling the drawing away.
 * While mounted the document never scrolls, pinch and double-tap zoom are
 * blocked inside it (`touch-action: pan-x pan-y` for Chrome/Android/Firefox,
 * plus cancelling Safari's `gesture*` events), and safe-area insets are
 * respected. If the page is zoomed anyway (browser or accessibility zoom),
 * the layout keeps its unzoomed size instead of re-flowing into the zoomed
 * rectangle.
 *
 * The route should also use `gameViewport` (viewport-fit=cover,
 * interactive-widget=resizes-content) from `./game-viewport-meta`.
 */
export function GameViewport({ children, className }: GameViewportProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [measured, setMeasured] = useState<MeasuredViewport>({
    keyboardOpen: false,
    height: 0,
    width: 0,
    layoutHeight: 0,
  })
  const [inAppKeyboards, setInAppKeyboards] = useState(0)
  const registerInAppKeyboard = useCallback(() => {
    setInAppKeyboards((count) => count + 1)
    return () => setInAppKeyboards((count) => Math.max(0, count - 1))
  }, [])
  const state = useMemo<GameViewportState>(
    () => ({
      keyboardOpen: measured.keyboardOpen,
      inAppKeyboard: inAppKeyboards > 0,
      keyboardShown: measured.keyboardOpen || inAppKeyboards > 0,
      height: measured.height,
      width: measured.width,
      layoutHeight: measured.layoutHeight,
    }),
    [measured, inAppKeyboards],
  )

  useVisualViewportPin(rootRef, setMeasured)
  useDocumentScrollLock()
  useZoomGuards(rootRef)

  return (
    <GameViewportContext value={state}>
      <InAppKeyboardContext value={registerInAppKeyboard}>
        <div
          ref={rootRef}
          data-game-viewport=""
          data-keyboard-open={state.keyboardOpen || undefined}
          data-keyboard-shown={state.keyboardShown || undefined}
          className={cx(
            'fixed inset-x-0 top-0 flex h-dvh flex-col overflow-hidden bg-[#f5f0e8] text-[#181713] will-change-transform',
            className,
          )}
          style={{
            // Pans only: no pinch zoom and no double-tap zoom anywhere on the
            // game surface. Scroll panes inside still scroll; the canvas sets
            // `none` for itself. (`manipulation` would still allow pinch.)
            touchAction: 'pan-x pan-y',
            overscrollBehavior: 'none',
            paddingTop: 'env(safe-area-inset-top)',
            paddingRight: 'env(safe-area-inset-right)',
            paddingBottom: 'env(safe-area-inset-bottom)',
            paddingLeft: 'env(safe-area-inset-left)',
          }}
        >
          {children}
        </div>
      </InAppKeyboardContext>
    </GameViewportContext>
  )
}

function useVisualViewportPin(
  rootRef: RefObject<HTMLDivElement | null>,
  setState: (update: (previous: MeasuredViewport) => MeasuredViewport) => void,
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
      // A zoomed page (accessibility or browser zoom) also shrinks the
      // visual viewport. Re-pinning then would squeeze the whole layout into
      // the zoomed rectangle, so keep the last unzoomed size until zoom ends.
      if ((viewport?.scale ?? 1) > ZOOMED_SCALE) return
      const height = Math.round(viewport?.height ?? window.innerHeight)
      const offsetTop = Math.round(viewport?.offsetTop ?? 0)
      root.style.height = `${height}px`
      root.style.transform = offsetTop
        ? `translate3d(0, ${offsetTop}px, 0)`
        : ''

      // The keyboard-closed height for this width: rotation resets it, and
      // with nothing to type into (so no soft keyboard) it is simply the
      // current height, so a window resized smaller is not mistaken for a
      // keyboard later. While typing, keep the tallest height seen.
      const editable = isEditableElement(document.activeElement)
      const width = window.innerWidth
      if (width !== baselineWidth) {
        baselineWidth = width
        baselineHeight = height
      } else if (!editable) {
        baselineHeight = height
      } else {
        baselineHeight = Math.max(baselineHeight, height)
      }
      const keyboardOpen =
        editable && height < baselineHeight * KEYBOARD_HEIGHT_RATIO
      const layoutHeight = keyboardOpen ? baselineHeight : height

      setState((previous) =>
        previous.height === height &&
        previous.keyboardOpen === keyboardOpen &&
        previous.width === width &&
        previous.layoutHeight === layoutHeight
          ? previous
          : { height, keyboardOpen, width, layoutHeight },
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

    // Belt and braces for browsers that ignore touch-action (old iOS).
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
