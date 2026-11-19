'use client'

import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'

import { isEditableElement, isModalOpen } from '../layout/editable'
import { cx } from '../ui/cx'
import { KeyboardIcon, SendIcon } from '../ui/icons'
import { CompactKeyboard } from './compact-keyboard'
import {
  describeFeedback,
  type FeedbackTone,
  type GuessDockFeedback,
} from './guess-feedback'
import {
  useCoarsePointer,
  useCompactKeyboardPreference,
} from './keyboard-preference'

export type { GuessDockFeedback }

/** The room accepts 1–60 characters per guess. */
export const MAX_GUESS_LENGTH = 60

export interface GuessDockProps {
  /** Resolve when the room accepted the guess; reject to keep the text. */
  readonly onGuess: (text: string) => Promise<void>
  /** When set, guessing is off and this explains why (e.g. "You're drawing"). */
  readonly disabledReason?: string | null
  readonly feedback?: GuessDockFeedback | null
  readonly placeholder?: string
  /** Desktop: typing anywhere on the page starts a guess. Default on. */
  readonly typeAnywhere?: boolean
  readonly className?: string
}

const TONE_CLASSES: Readonly<Record<FeedbackTone, string>> = {
  correct: 'bg-[#1f9d72] text-white',
  warm: 'bg-[#f8ff80] text-[#181713]',
  neutral: 'text-black/60',
  error: 'bg-[#ff6b4a] text-white',
}

/**
 * The guess composer. It never scrolls or navigates: submitting keeps focus
 * in the input (with `preventScroll`), clears it on success, and keeps the
 * text when sending fails. With the compact keyboard on, the input uses
 * `inputMode="none"` so the phone keyboard never opens.
 */
export function GuessDock({
  onGuess,
  disabledReason = null,
  feedback = null,
  placeholder = 'Type your guess',
  typeAnywhere = true,
  className,
}: GuessDockProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const caretRef = useRef<number | null>(null)
  const [value, setValue] = useState('')
  const [lastGuess, setLastGuess] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<{
    message: string
    afterFeedbackId: number | null
  } | null>(null)
  const [compact, setCompact] = useCompactKeyboardPreference()
  const coarsePointer = useCoarsePointer()
  const feedbackId = useId()
  const disabled = disabledReason !== null

  const focusInput = () => inputRef.current?.focus({ preventScroll: true })

  // Restore the caret after programmatic edits (compact keys, ↑ recall).
  useLayoutEffect(() => {
    const caret = caretRef.current
    const input = inputRef.current
    if (caret === null || !input) return
    caretRef.current = null
    if (document.activeElement === input) input.setSelectionRange(caret, caret)
  }, [value])

  const submit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    focusInput()
    const text = value.trim()
    if (!text || disabled || sending) return

    // Clear right away so the next guess can be typed while this one flies;
    // put the text back if the room did not take it.
    setValue('')
    setLastGuess(text)
    setSending(true)
    setSendError(null)
    try {
      await onGuess(text)
    } catch (error) {
      setValue((current) => (current === '' ? text : current))
      setSendError({
        message:
          error instanceof Error && error.message
            ? error.message
            : 'That guess did not send. Try again.',
        afterFeedbackId: feedback?.id ?? null,
      })
    } finally {
      setSending(false)
      focusInput()
    }
  }

  const replaceSelection = (text: string) => {
    const input = inputRef.current
    const focused = input !== null && document.activeElement === input
    const start = focused
      ? (input.selectionStart ?? value.length)
      : value.length
    const end = focused ? (input.selectionEnd ?? value.length) : value.length
    const next = (value.slice(0, start) + text + value.slice(end)).slice(
      0,
      MAX_GUESS_LENGTH,
    )
    caretRef.current = Math.min(start + text.length, next.length)
    setValue(next)
    if (!focused) focusInput()
  }

  const backspace = () => {
    const input = inputRef.current
    const focused = input !== null && document.activeElement === input
    const start = focused
      ? (input.selectionStart ?? value.length)
      : value.length
    const end = focused ? (input.selectionEnd ?? value.length) : value.length
    if (start === end && start === 0) return
    const from = start === end ? start - 1 : start
    caretRef.current = from
    setValue(value.slice(0, from) + value.slice(end))
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowUp' && lastGuess) {
      event.preventDefault()
      caretRef.current = lastGuess.length
      setValue(lastGuess)
    }
  }

  const onWindowKey = useEffectEvent((event: globalThis.KeyboardEvent) => {
    if (!typeAnywhere || disabled || event.defaultPrevented) return
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing)
      return
    if (event.key.length !== 1) return
    const input = inputRef.current
    const active = document.activeElement
    if (
      !input ||
      active === input ||
      isEditableElement(active) ||
      isModalOpen()
    )
      return
    // Space on a focused button should still press the button.
    if (event.key === ' ' && active && active !== document.body) return
    event.preventDefault()
    focusInput()
    caretRef.current = Math.min(value.length + 1, MAX_GUESS_LENGTH)
    setValue((current) => (current + event.key).slice(0, MAX_GUESS_LENGTH))
  })

  useEffect(() => {
    const listener = (event: globalThis.KeyboardEvent) => onWindowKey(event)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  const switchKeyboard = (useCompact: boolean) => {
    const input = inputRef.current
    setCompact(useCompact)
    if (!input) return
    // Change the attribute before refocusing so iOS honors it in this tap.
    input.inputMode = useCompact ? 'none' : 'text'
    input.blur()
    input.focus({ preventScroll: true })
  }

  const status =
    sendError && sendError.afterFeedbackId === (feedback?.id ?? null)
      ? { message: sendError.message, tone: 'error' as const }
      : feedback
        ? describeFeedback(feedback)
        : null

  const showCompact = compact && !disabled
  return (
    <div className={cx('shrink-0 bg-[#f5f0e8]', className)}>
      <form
        onSubmit={submit}
        aria-label="Guess the drawing"
        className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-1 px-3 pt-2"
      >
        <label className="sr-only" htmlFor={`${feedbackId}-input`}>
          Your guess
        </label>
        <input
          ref={inputRef}
          id={`${feedbackId}-input`}
          name="guess"
          value={value}
          onChange={(event) =>
            setValue(event.target.value.slice(0, MAX_GUESS_LENGTH))
          }
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={disabled ? (disabledReason ?? '') : placeholder}
          aria-describedby={feedbackId}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="send"
          inputMode={showCompact ? 'none' : 'text'}
          maxLength={MAX_GUESS_LENGTH}
          className="min-h-12 min-w-0 rounded-xl border-2 border-[#181713] bg-white px-4 text-base text-[#181713] outline-none placeholder:text-black/40 focus:ring-4 focus:ring-[#5c4cf2]/25 disabled:bg-white/60"
        />
        <button
          type="submit"
          disabled={disabled || value.trim().length === 0}
          onPointerDown={(event) => event.preventDefault()}
          aria-label="Send guess"
          className="inline-flex min-h-12 min-w-12 items-center justify-center gap-1.5 rounded-xl border-2 border-[#181713] bg-[#5c4cf2] px-4 font-black text-white shadow-[2px_2px_0_#181713] transition active:translate-x-px active:translate-y-px active:shadow-none disabled:opacity-45"
        >
          <SendIcon width={18} height={18} />
          <span className="hidden sm:inline">Guess</span>
        </button>
        <div className="col-span-2 flex h-7 min-w-0 items-center gap-2">
          <p
            id={feedbackId}
            role="status"
            aria-live="polite"
            className="flex min-w-0 flex-1 items-center"
          >
            {status ? (
              <span
                key={feedback?.id ?? 'error'}
                className={cx(
                  'truncate rounded-full px-2.5 py-0.5 text-sm font-bold',
                  TONE_CLASSES[status.tone],
                )}
              >
                {status.message}
              </span>
            ) : (
              <span className="truncate px-1 text-xs text-black/45">
                {disabled
                  ? disabledReason
                  : 'Only you see how close your guesses are.'}
              </span>
            )}
          </p>
          {!disabled && coarsePointer && !compact ? (
            <button
              type="button"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => switchKeyboard(true)}
              className="inline-flex min-h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-bold text-black/60 hover:bg-black/5"
            >
              <KeyboardIcon width={16} height={16} />
              Use compact keyboard
            </button>
          ) : null}
        </div>
      </form>
      {showCompact ? (
        <CompactKeyboard
          onKey={replaceSelection}
          onBackspace={backspace}
          onSend={() => void submit()}
          onUsePhoneKeyboard={() => switchKeyboard(false)}
          sendDisabled={value.trim().length === 0}
        />
      ) : null}
    </div>
  )
}
