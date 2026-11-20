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
  type ReactNode,
} from 'react'

import { isEditableElement, isModalOpen } from '../layout/editable'
import { useInAppKeyboard } from '../layout/game-viewport'
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

/** The status line's default note while there is nothing else to show. */
export const GUESS_PRIVACY_NOTE =
  'Only you and your drawer see how close your guesses are.'

/** The room accepts 1–60 characters per guess. */
export const MAX_GUESS_LENGTH = 60

export interface GuessDockProps {
  /**
   * Resolve when the room accepted the guess; reject to keep the text. May be
   * called again before an earlier guess settles (the room client queues
   * guesses and paces them to the room's rate limit).
   */
  readonly onGuess: (text: string) => Promise<void>
  /** When set, guessing is off and this explains why (e.g. "You're drawing"). */
  readonly disabledReason?: string | null
  readonly feedback?: GuessDockFeedback | null
  readonly placeholder?: string
  /** Desktop: typing anywhere on the page starts a guess. Default on. */
  readonly typeAnywhere?: boolean
  /**
   * Shown in the status line while there is no feedback to show (e.g. the
   * latest teammate guess when the feed is hidden). Defaults to a privacy
   * note about near-miss feedback.
   */
  readonly idleStatus?: ReactNode
  /** Small extra item at the end of the status line (e.g. opponent status). */
  readonly statusAside?: ReactNode
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
 * in the input (with `preventScroll`) and clears it at once, so the next
 * guess can be typed and sent while earlier ones are still queued; a guess
 * that fails to send comes back (or is named in the status line). With the
 * compact keyboard on, the input uses `inputMode="none"` so the phone
 * keyboard never opens; the keys can be tucked away and come back when the
 * input is tapped. While the keys show, the dock tells the surrounding
 * `GameViewport` (`useInAppKeyboard`) so the play layout tightens around the
 * drawing just as for a device keyboard.
 */
export function GuessDock({
  onGuess,
  disabledReason = null,
  feedback = null,
  placeholder = 'Type your guess',
  typeAnywhere = true,
  idleStatus,
  statusAside,
  className,
}: GuessDockProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const caretRef = useRef<number | null>(null)
  // Set when a failed guess is put back: the next keystroke replaces it.
  const selectRestoredRef = useRef(false)
  const [value, setValue] = useState('')
  const [lastGuess, setLastGuess] = useState<string | null>(null)
  const [sendError, setSendError] = useState<{
    message: string
    afterFeedbackId: number | null
  } | null>(null)
  const [compact, setCompact] = useCompactKeyboardPreference()
  // Hiding the compact keys is for this screen only; the input brings them back.
  const [compactHidden, setCompactHidden] = useState(false)
  const coarsePointer = useCoarsePointer()
  const feedbackId = useId()
  const disabled = disabledReason !== null
  const showCompact = compact && !disabled && !compactHidden
  useInAppKeyboard(showCompact)

  const focusInput = () => inputRef.current?.focus({ preventScroll: true })

  // A send error shows until newer feedback arrives. Guesses are queued, so
  // feedback for an earlier guess can land while a later one is in flight:
  // compare against the newest feedback, not the one seen at submit time.
  const latestFeedbackIdRef = useRef<number | null>(feedback?.id ?? null)
  useLayoutEffect(() => {
    latestFeedbackIdRef.current = feedback?.id ?? null
  }, [feedback])

  // Restore the caret after programmatic edits (compact keys, ↑ recall), or
  // select a guess that was put back after failing to send.
  useLayoutEffect(() => {
    const caret = caretRef.current
    const selectAll = selectRestoredRef.current
    const input = inputRef.current
    caretRef.current = null
    selectRestoredRef.current = false
    if (!input || document.activeElement !== input) return
    if (selectAll) input.setSelectionRange(0, input.value.length)
    else if (caret !== null) input.setSelectionRange(caret, caret)
  }, [value])

  const submit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    focusInput()
    const text = value.trim()
    if (!text || disabled) return

    // Clear right away so the next guess can be typed (and sent: the room
    // client queues it) while this one flies.
    setValue('')
    setLastGuess(text)
    setSendError(null)
    try {
      await onGuess(text)
    } catch (error) {
      const reason =
        error instanceof Error && error.message
          ? error.message
          : 'That guess did not send. Try again.'
      // Never drop a guess silently. Put it back, selected, when the input
      // is empty, so Enter resends it and typing replaces it; otherwise the
      // player is already typing the next one, so name it in the status.
      // The DOM input holds the latest typed text even mid-render.
      const restored = (inputRef.current?.value ?? '') === ''
      if (restored) {
        selectRestoredRef.current = true
        setValue(text)
      }
      setSendError({
        message: restored ? reason : `“${text}” didn’t send. ${reason}`,
        afterFeedbackId: latestFeedbackIdRef.current,
      })
    } finally {
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
    setCompactHidden(false)
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

  const showKeyboardSwitch = !disabled && coarsePointer
  return (
    <div className={cx('shrink-0 bg-[#f5f0e8]', className)}>
      <form
        onSubmit={submit}
        aria-label="Guess the drawing"
        className={cx(
          'grid gap-x-2 gap-y-0.5 px-3 pb-0.5 pt-1.5 @container',
          showKeyboardSwitch
            ? 'grid-cols-[minmax(0,1fr)_auto_auto]'
            : 'grid-cols-[minmax(0,1fr)_auto]',
        )}
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
          // A tap on the input brings tucked-away compact keys back.
          onClick={() => setCompactHidden(false)}
          disabled={disabled}
          placeholder={disabled ? (disabledReason ?? '') : placeholder}
          aria-describedby={feedbackId}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="send"
          inputMode={compact && !disabled ? 'none' : 'text'}
          maxLength={MAX_GUESS_LENGTH}
          className="min-h-11 min-w-0 rounded-xl border-2 border-[#181713] bg-white px-4 text-base text-[#181713] outline-none placeholder:text-black/40 focus:ring-4 focus:ring-[#5c4cf2]/25 disabled:bg-white/60"
        />
        {showKeyboardSwitch ? (
          <button
            type="button"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => switchKeyboard(!compact)}
            aria-label={compact ? 'Use phone keyboard' : 'Use compact keyboard'}
            title={compact ? 'Use phone keyboard' : 'Use compact keyboard'}
            data-testid="keyboard-switch"
            className="grid min-h-11 min-w-11 place-items-center rounded-xl border-2 border-[#181713]/20 bg-white text-black/65 transition active:scale-95"
          >
            <KeyboardIcon width={20} height={20} />
          </button>
        ) : null}
        <button
          type="submit"
          disabled={disabled || value.trim().length === 0}
          onPointerDown={(event) => event.preventDefault()}
          aria-label="Send guess"
          className="inline-flex min-h-11 min-w-12 items-center justify-center gap-1.5 rounded-xl border-2 border-[#181713] bg-[#5c4cf2] px-4 font-black text-white shadow-[2px_2px_0_#181713] transition active:translate-x-px active:translate-y-px active:shadow-none disabled:opacity-45"
        >
          <SendIcon width={18} height={18} />
          <span className="hidden @min-[28rem]:inline">Guess</span>
        </button>
        <div
          className={cx(
            'flex h-6 min-w-0 items-center gap-2',
            showKeyboardSwitch ? 'col-span-3' : 'col-span-2',
          )}
        >
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
            ) : disabled ? (
              <span className="truncate px-1 text-xs text-black/45">
                {disabledReason}
              </span>
            ) : idleStatus !== undefined ? (
              idleStatus
            ) : (
              <span className="truncate px-1 text-xs text-black/45">
                {GUESS_PRIVACY_NOTE}
              </span>
            )}
          </p>
          {statusAside}
        </div>
      </form>
      {showCompact ? (
        <CompactKeyboard
          onKey={replaceSelection}
          onBackspace={backspace}
          onSend={() => void submit()}
          onHide={() => setCompactHidden(true)}
          sendDisabled={value.trim().length === 0}
        />
      ) : null}
    </div>
  )
}
