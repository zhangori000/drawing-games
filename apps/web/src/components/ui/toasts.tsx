'use client'

import { useEffect } from 'react'

import { cx } from './cx'

export interface ToastItem {
  readonly id: number
  readonly message: string
  readonly tone: 'error' | 'info'
}

export interface ToastsProps {
  readonly items: readonly ToastItem[]
  readonly onDismiss: (id: number) => void
  readonly autoDismissMs?: number
}

/**
 * Stacked notices at the top of the screen (away from the guess dock and
 * keyboard). Each one dismisses itself after a few seconds.
 */
export function Toasts({
  items,
  onDismiss,
  autoDismissMs = 5000,
}: ToastsProps) {
  return (
    <div
      aria-live="polite"
      aria-relevant="additions"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]"
    >
      {items.map((item) => (
        <Toast
          key={item.id}
          item={item}
          onDismiss={onDismiss}
          autoDismissMs={autoDismissMs}
        />
      ))}
    </div>
  )
}

function Toast({
  item,
  onDismiss,
  autoDismissMs,
}: {
  readonly item: ToastItem
  readonly onDismiss: (id: number) => void
  readonly autoDismissMs: number
}) {
  useEffect(() => {
    const id = window.setTimeout(() => onDismiss(item.id), autoDismissMs)
    return () => window.clearTimeout(id)
  }, [item.id, onDismiss, autoDismissMs])

  return (
    <div
      role={item.tone === 'error' ? 'alert' : 'status'}
      className={cx(
        'pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border-2 border-[#181713] px-4 py-3 text-sm font-semibold shadow-[4px_4px_0_#181713]',
        item.tone === 'error'
          ? 'bg-[#ff6b4a] text-[#181713]'
          : 'bg-[#f8ff80] text-[#181713]',
      )}
    >
      <p className="min-w-0 flex-1 leading-5">{item.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label="Dismiss"
        className="-my-2.5 -mr-3 grid size-10 shrink-0 place-items-center rounded-lg text-lg leading-none hover:bg-black/10"
      >
        ×
      </button>
    </div>
  )
}
