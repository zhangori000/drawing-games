'use client'

import { useEffect, useState } from 'react'

import { buttonClassName, type ButtonSize, type ButtonVariant } from './button'

export interface CopyButtonProps {
  readonly text: string
  readonly label?: string
  readonly copiedLabel?: string
  readonly variant?: ButtonVariant
  readonly size?: ButtonSize
  readonly className?: string
}

export function CopyButton({
  text,
  label = 'Copy',
  copiedLabel = 'Copied!',
  variant = 'secondary',
  size = 'sm',
  className,
}: CopyButtonProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  useEffect(() => {
    if (state === 'idle') return
    const id = window.setTimeout(() => setState('idle'), 1600)
    return () => window.clearTimeout(id)
  }, [state])

  return (
    <button
      type="button"
      onClick={async () =>
        setState((await copyText(text)) ? 'copied' : 'failed')
      }
      className={buttonClassName(variant, size, className)}
    >
      <span aria-live="polite">
        {state === 'copied'
          ? copiedLabel
          : state === 'failed'
            ? 'Copy failed'
            : label}
      </span>
    </button>
  )
}

/**
 * Copies text. `navigator.clipboard` only exists in secure contexts, and
 * phones on the LAN dev server use plain http, so fall back to a hidden
 * textarea. The fallback uses a 16 px font so iOS never zooms on it.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (window.isSecureContext && navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through to the legacy path.
  }

  const active = document.activeElement
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.cssText =
    'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;'
  document.body.append(textarea)
  textarea.select()
  textarea.setSelectionRange(0, text.length)
  let copied = false
  try {
    copied = document.execCommand('copy')
  } catch {
    copied = false
  }
  textarea.remove()
  if (active instanceof HTMLElement) active.focus({ preventScroll: true })
  return copied
}
