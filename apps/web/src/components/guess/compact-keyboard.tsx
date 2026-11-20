'use client'

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'

import { cx } from '../ui/cx'
import { BackspaceIcon, KeyboardHideIcon, SendIcon } from '../ui/icons'

export { useCompactKeyboardPreference } from './keyboard-preference'

const LETTER_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'] as const
const REPEAT_DELAY_MS = 400
const REPEAT_INTERVAL_MS = 70

export interface CompactKeyboardProps {
  readonly onKey: (text: string) => void
  readonly onBackspace: () => void
  readonly onSend: () => void
  /** Tuck the keys away (tapping the guess input brings them back). */
  readonly onHide?: () => void
  readonly disabled?: boolean
  readonly sendDisabled?: boolean
  readonly className?: string
}

/**
 * In-app QWERTY for guessing on phones. It never opens the native keyboard,
 * so the visual viewport (and the drawing) never resizes. Keys act on
 * pointer-down with `preventDefault`, so focus and the caret stay in the
 * guess input. Rows are 40 px tall (four rows, about 180 px in all) so the
 * drawing above keeps most of a phone screen; switching to the device
 * keyboard lives in the guess input row.
 */
export function CompactKeyboard({
  onKey,
  onBackspace,
  onSend,
  onHide,
  disabled = false,
  sendDisabled = false,
  className,
}: CompactKeyboardProps) {
  return (
    <div
      role="group"
      aria-label="Compact keyboard"
      data-testid="compact-keyboard"
      className={cx(
        'select-none border-t-2 border-[#181713] bg-[#e9e3d8] px-1 pb-1 pt-1',
        disabled && 'opacity-50',
        className,
      )}
      style={{ touchAction: 'manipulation', WebkitUserSelect: 'none' }}
    >
      <div className="flex flex-col gap-1">
        {LETTER_ROWS.map((row, rowIndex) => (
          <div
            key={row}
            className={cx(
              'flex gap-1',
              rowIndex === 1 && 'px-[5%]',
              rowIndex === 2 && 'px-[15%]',
            )}
          >
            {[...row].map((letter) => (
              <Key
                key={letter}
                label={letter}
                disabled={disabled}
                onPress={() => onKey(letter)}
              >
                {letter}
              </Key>
            ))}
          </div>
        ))}
        <div className="flex gap-1">
          {onHide ? (
            <Key
              label="Hide keyboard"
              disabled={false}
              onPress={onHide}
              tone="action"
              className="max-w-12"
            >
              <KeyboardHideIcon width={20} height={20} />
            </Key>
          ) : null}
          <Key
            label="Backspace"
            disabled={disabled}
            onPress={onBackspace}
            repeat
            tone="action"
            className="max-w-16 flex-[1.4]"
          >
            <BackspaceIcon width={20} height={20} />
          </Key>
          <Key
            label="Apostrophe"
            disabled={disabled}
            onPress={() => onKey("'")}
            className="max-w-10"
          >
            &apos;
          </Key>
          <Key
            label="Hyphen"
            disabled={disabled}
            onPress={() => onKey('-')}
            className="max-w-10"
          >
            -
          </Key>
          <Key
            label="Space"
            disabled={disabled}
            onPress={() => onKey(' ')}
            className="flex-[4]"
          >
            <span className="text-xs font-bold text-black/45">space</span>
          </Key>
          <Key
            label="Send"
            disabled={disabled || sendDisabled}
            onPress={onSend}
            tone="send"
            className="max-w-24 flex-[1.8]"
          >
            <SendIcon width={18} height={18} />
            <span className="text-sm font-black">Send</span>
          </Key>
        </div>
      </div>
    </div>
  )
}

type KeyTone = 'letter' | 'action' | 'send'

const KEY_TONES: Readonly<Record<KeyTone, string>> = {
  letter: 'border-black/10 bg-white text-[#181713]',
  action: 'border-black/10 bg-[#cfc7b9] text-[#181713]',
  send: 'border-[#181713] bg-[#5c4cf2] text-white',
}

interface KeyProps {
  readonly label: string
  /** Colors live here (not in className) so they never fight the base. */
  readonly tone?: KeyTone
  readonly onPress: () => void
  readonly disabled: boolean
  readonly repeat?: boolean
  readonly className?: string
  readonly children: ReactNode
}

function Key({
  label,
  tone = 'letter',
  onPress,
  disabled,
  repeat = false,
  className,
  children,
}: KeyProps) {
  const [pressed, setPressed] = useState(false)
  const timers = useRef<{ delay: number; interval: number }>({
    delay: 0,
    interval: 0,
  })
  // Auto-repeat must call the latest handler (it reads the latest input text).
  const onPressRef = useRef(onPress)
  useEffect(() => {
    onPressRef.current = onPress
  })

  const stopRepeat = () => {
    window.clearTimeout(timers.current.delay)
    window.clearInterval(timers.current.interval)
  }
  useEffect(() => stopRepeat, [])

  const release = () => {
    setPressed(false)
    stopRepeat()
  }

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    // Keep focus (and the caret) in the guess input.
    event.preventDefault()
    if (disabled || event.button > 0) return
    setPressed(true)
    onPress()
    if (repeat) {
      stopRepeat()
      timers.current.delay = window.setTimeout(() => {
        timers.current.interval = window.setInterval(
          () => onPressRef.current(),
          REPEAT_INTERVAL_MS,
        )
      }, REPEAT_DELAY_MS)
    }
  }

  // Keyboard activation (Enter/Space on a focused key) has detail === 0;
  // pointer clicks were already handled on pointer-down.
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail === 0 && !disabled) onPress()
  }

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      data-pressed={pressed || undefined}
      onPointerDown={handlePointerDown}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      onClick={handleClick}
      onContextMenu={(event) => event.preventDefault()}
      className={cx(
        'flex h-10 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border-2 text-lg font-bold lowercase shadow-[0_2px_0_rgba(24,23,19,0.25)] transition-transform duration-75 disabled:opacity-60',
        KEY_TONES[tone],
        'data-[pressed]:translate-y-0.5 data-[pressed]:scale-95 data-[pressed]:shadow-none data-[pressed]:brightness-90',
        className,
      )}
    >
      {children}
    </button>
  )
}
