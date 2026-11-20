import type { ComponentPropsWithRef } from 'react'

import { cx } from './cx'

export type ButtonVariant =
  'primary' | 'secondary' | 'accent' | 'lime' | 'success' | 'dark' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

/** Chunky offset shadow that presses in; not used by the ghost variant. */
const SOLID =
  'border-[#181713] shadow-[3px_3px_0_#181713] hover:-translate-y-0.5 hover:shadow-[4px_4px_0_#181713] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_#181713]'

const VARIANT_CLASSES: Readonly<Record<ButtonVariant, string>> = {
  primary: `${SOLID} bg-[#5c4cf2] text-white`,
  secondary: `${SOLID} bg-white text-[#181713]`,
  accent: `${SOLID} bg-[#ff6b4a] text-[#181713]`,
  lime: `${SOLID} bg-[#f8ff80] text-[#181713]`,
  success: `${SOLID} bg-[#1f9d72] text-white`,
  dark: `${SOLID} bg-[#181713] text-white`,
  ghost: 'border-transparent bg-transparent text-[#181713] hover:bg-black/5',
}

const SIZE_CLASSES: Readonly<Record<ButtonSize, string>> = {
  sm: 'min-h-11 rounded-xl px-3 text-sm',
  md: 'min-h-12 rounded-xl px-4 text-base',
  lg: 'min-h-14 rounded-2xl px-6 text-lg',
}

const BASE =
  'inline-flex select-none items-center justify-center gap-2 border-2 font-black tracking-[-0.01em] transition duration-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5c4cf2]/35 disabled:pointer-events-none disabled:opacity-45'

/** Class names for anything that should look like a button (e.g. a Link). */
export function buttonClassName(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  extra?: string,
): string {
  return cx(BASE, VARIANT_CLASSES[variant], SIZE_CLASSES[size], extra)
}

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  readonly variant?: ButtonVariant
  readonly size?: ButtonSize
  /** Stretch to the container width. */
  readonly block?: boolean
  /** Shows a busy state and blocks clicks. */
  readonly loading?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  loading = false,
  className,
  disabled,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClassName(
        variant,
        size,
        cx(block && 'w-full', className),
      )}
      {...rest}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  )
}

export function Spinner({ className }: { readonly className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent',
        className,
      )}
    />
  )
}
