'use client'

import { useCallback, useSyncExternalStore } from 'react'

import { cx } from './cx'

const TICK_MS = 250
export const URGENT_SECONDS = 10

function subscribeToTicks(onTick: () => void): () => void {
  const id = window.setInterval(onTick, TICK_MS)
  return () => window.clearInterval(id)
}

const noDeadline = () => null

/**
 * Whole seconds left until a server deadline, re-checked 4×/s but only
 * re-rendering when the number changes. `serverNow` should be the room's
 * clock estimate so devices with wrong clocks still agree.
 */
export function useCountdown(
  deadlineAtMs: number | null,
  serverNow: () => number = Date.now,
): { readonly secondsLeft: number | null; readonly urgent: boolean } {
  const getSnapshot = useCallback(
    () =>
      deadlineAtMs === null
        ? null
        : Math.max(0, Math.ceil((deadlineAtMs - serverNow()) / 1000)),
    [deadlineAtMs, serverNow],
  )
  const secondsLeft = useSyncExternalStore(
    subscribeToTicks,
    getSnapshot,
    noDeadline,
  )
  return {
    secondsLeft,
    urgent: secondsLeft !== null && secondsLeft < URGENT_SECONDS,
  }
}

export function formatClock(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return minutes > 0
    ? `${minutes}:${String(rest).padStart(2, '0')}`
    : `:${String(rest).padStart(2, '0')}`
}

export interface CountdownProps {
  readonly deadlineAtMs: number | null
  readonly serverNow?: () => number
  /** Spoken context, e.g. "Drawing time". */
  readonly label?: string
  readonly className?: string
}

export function Countdown({
  deadlineAtMs,
  serverNow,
  label = 'Time left',
  className,
}: CountdownProps) {
  const { secondsLeft, urgent } = useCountdown(deadlineAtMs, serverNow)
  if (secondsLeft === null) return null
  return (
    <span
      role="timer"
      aria-label={`${label}: ${secondsLeft} seconds`}
      className={cx(
        'grid min-w-16 place-items-center rounded-full border-2 border-[#181713] px-3 py-1.5 font-mono text-base font-black tabular-nums transition-colors',
        urgent
          ? 'animate-pulse bg-[#ff6b4a] text-white'
          : 'bg-white text-[#181713]',
        className,
      )}
    >
      {formatClock(secondsLeft)}
    </span>
  )
}
