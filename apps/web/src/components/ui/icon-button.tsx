import type { ComponentPropsWithRef, ReactNode } from 'react'

import { cx } from './cx'

export interface IconButtonProps extends Omit<
  ComponentPropsWithRef<'button'>,
  'children'
> {
  /** Accessible name; also shown as a tooltip. */
  readonly label: string
  readonly children: ReactNode
  readonly pressed?: boolean
  readonly tone?: 'plain' | 'solid'
}

/** A square 44 px button with an icon and an accessible label. */
export function IconButton({
  label,
  children,
  pressed,
  tone = 'plain',
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cx(
        'grid size-11 shrink-0 select-none place-items-center rounded-xl border-2 transition duration-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5c4cf2]/35 disabled:pointer-events-none disabled:opacity-35',
        tone === 'solid'
          ? 'border-[#181713] bg-white shadow-[2px_2px_0_#181713] active:translate-x-px active:translate-y-px active:shadow-none'
          : 'border-transparent bg-black/5 hover:bg-black/10 active:scale-95',
        'aria-pressed:border-[#181713] aria-pressed:bg-white aria-pressed:shadow-[2px_2px_0_#181713]',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
