import type { ComponentPropsWithRef, ReactNode } from 'react'

import { cx } from './cx'

export type BadgeTone =
  'neutral' | 'ink' | 'violet' | 'coral' | 'lime' | 'green'

const TONES: Readonly<Record<BadgeTone, string>> = {
  neutral: 'border-black/15 bg-white/70 text-black/70',
  ink: 'border-[#181713] bg-[#181713] text-white',
  violet: 'border-[#181713] bg-[#5c4cf2] text-white',
  coral: 'border-[#181713] bg-[#ff6b4a] text-white',
  lime: 'border-[#181713] bg-[#f8ff80] text-[#181713]',
  green: 'border-[#181713] bg-[#1f9d72] text-white',
}

export interface BadgeProps {
  readonly tone?: BadgeTone
  readonly children: ReactNode
  readonly className?: string
}

/** Small static label, e.g. a difficulty or a status. */
export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export interface ChipProps extends ComponentPropsWithRef<'button'> {
  readonly selected?: boolean
}

/** Toggleable filter pill (44 px tall for touch). */
export function Chip({
  selected = false,
  className,
  type = 'button',
  ...rest
}: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cx(
        'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border-2 px-4 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5c4cf2]/35',
        selected
          ? 'border-[#181713] bg-[#181713] text-white'
          : 'border-black/15 bg-white/70 text-black/70 hover:border-[#181713]',
        className,
      )}
      {...rest}
    />
  )
}
