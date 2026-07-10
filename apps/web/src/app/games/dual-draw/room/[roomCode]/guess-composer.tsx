'use client'

import { useRef, useState, type FormEvent } from 'react'

interface GuessResult {
  readonly correct: boolean
}

interface GuessComposerProps {
  readonly onGuess: (guess: string) => Promise<GuessResult>
}

export function GuessComposer({ onGuess }: GuessComposerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [guess, setGuess] = useState('')
  const [status, setStatus] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submitGuess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedGuess = guess.trim()
    if (!normalizedGuess || submitting) return

    setSubmitting(true)
    setStatus('Sending guess…')

    try {
      const result = await onGuess(normalizedGuess)
      setGuess('')
      setStatus(
        result.correct
          ? 'Correct — your team solved it.'
          : 'Not quite. Keep looking at the drawing.',
      )
    } catch {
      setStatus('That guess did not send. Try it again.')
    } finally {
      setSubmitting(false)
      requestAnimationFrame(() =>
        inputRef.current?.focus({ preventScroll: true }),
      )
    }
  }

  return (
    <form
      aria-label="Submit a guess"
      data-testid="guess-composer"
      onSubmit={submitGuess}
      className="grid h-[92px] shrink-0 grid-cols-[minmax(0,1fr)_auto] grid-rows-[48px_20px] gap-x-2 gap-y-1 border-t-2 border-[#181713] bg-[#f5f0e8] p-3 sm:h-[100px] sm:p-4"
    >
      <label className="sr-only" htmlFor="room-guess-input">
        Your guess
      </label>
      <input
        ref={inputRef}
        id="room-guess-input"
        value={guess}
        onChange={(event) => setGuess(event.target.value)}
        aria-describedby="guess-status"
        autoComplete="off"
        autoCapitalize="none"
        enterKeyHint="send"
        spellCheck={false}
        placeholder="Type without losing the canvas"
        className="min-w-0 rounded-xl border-2 border-[#181713] bg-white px-4 text-base outline-none placeholder:text-black/35 focus:ring-4 focus:ring-[#5c4cf2]/25"
      />
      <button
        type="submit"
        disabled={submitting || guess.trim().length === 0}
        className="rounded-xl border-2 border-[#181713] bg-[#5c4cf2] px-5 font-black text-white shadow-[2px_2px_0_#181713] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"
      >
        Guess
      </button>
      <p
        id="guess-status"
        role="status"
        aria-live="polite"
        className="col-span-2 h-5 truncate px-1 text-xs leading-5 text-black/55"
      >
        {status || '\u00a0'}
      </p>
    </form>
  )
}
