import type { ReactNode } from 'react'

import { cx } from '@/components/ui/cx'

/**
 * A region that scrolls inside the fixed play viewport. The document itself
 * never scrolls; overscroll stays contained so it cannot chain to the page.
 */
export function ScrollPane({
  children,
  className,
  label,
}: {
  readonly children: ReactNode
  readonly className?: string
  readonly label?: string
}) {
  return (
    <div
      aria-label={label}
      role={label ? 'region' : undefined}
      className={cx(
        'min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function Card({
  children,
  className,
  as: Tag = 'section',
  labelledBy,
}: {
  readonly children: ReactNode
  readonly className?: string
  readonly as?: 'section' | 'div' | 'article'
  readonly labelledBy?: string
}) {
  return (
    <Tag
      aria-labelledby={labelledBy}
      className={cx(
        'rounded-3xl border-2 border-[#181713] bg-[#fffdf7] p-4 shadow-[4px_4px_0_#181713] sm:p-5',
        className,
      )}
    >
      {children}
    </Tag>
  )
}

/** Small mono uppercase label above a heading or group. */
export function Eyebrow({
  children,
  className,
}: {
  readonly children: ReactNode
  readonly className?: string
}) {
  return (
    <p
      className={cx(
        'font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-black/55',
        className,
      )}
    >
      {children}
    </p>
  )
}
