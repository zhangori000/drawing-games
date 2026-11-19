'use client'

import type { DraftOptionView } from '@drawing-games/game-core'
import type { DraftReplacementReason } from '@drawing-games/protocol'
import { useEffect, useEffectEvent, useState, type ReactNode } from 'react'

import { isEditableElement, isModalOpen } from '@/components/layout/editable'
import { cx } from '@/components/ui/cx'

import { difficultyStake, plural } from '../../_lib/format'
import { useRoomSession } from '../room-session'
import { DifficultyChip } from '../shared/difficulty-chip'

export interface DraftCardsProps {
  readonly options: readonly DraftOptionView[]
  readonly replacementsLeft: number
}

/** The drawer's option cards. Keys 1–5 pick; swaps keep the difficulty. */
export function DraftCards({ options, replacementsLeft }: DraftCardsProps) {
  const { actions, pending } = useRoomSession()
  const picking = options.some((option) => pending.has(`pick-${option.wordId}`))

  const pick = (option: DraftOptionView) => {
    if (picking) return
    void pending.run(`pick-${option.wordId}`, () =>
      actions.selectWord(option.wordId),
    )
  }

  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    )
      return
    if (isEditableElement(event.target) || isModalOpen()) return
    if (!/^[1-5]$/.test(event.key)) return
    const option = options[Number(event.key) - 1]
    if (!option) return
    event.preventDefault()
    pick(option)
  })

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKey(event)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  return (
    <div className="grid gap-3">
      <ol
        aria-label="Your word cards"
        className={cx(
          'grid gap-3',
          options.length >= 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2',
          options.length >= 4 && 'lg:grid-cols-4',
          options.length >= 5 && 'xl:grid-cols-5',
        )}
      >
        {options.map((option, index) => (
          <OptionCard
            key={option.wordId}
            option={option}
            index={index}
            disabled={picking}
            replacementsLeft={replacementsLeft}
            onPick={() => pick(option)}
          />
        ))}
      </ol>
      <p className="text-sm font-semibold text-black/55" aria-live="polite">
        {replacementsLeft > 0
          ? `${plural(replacementsLeft, 'swap')} left. A new card keeps the same difficulty.`
          : 'No swaps left — pick the one you like best.'}
      </p>
    </div>
  )
}

function OptionCard({
  option,
  index,
  disabled,
  replacementsLeft,
  onPick,
}: {
  readonly option: DraftOptionView
  readonly index: number
  readonly disabled: boolean
  readonly replacementsLeft: number
  readonly onPick: () => void
}) {
  const { actions, pending } = useRoomSession()
  const [showDefinition, setShowDefinition] = useState(false)
  const replaceKey = `replace-${option.wordId}`
  const replacing = pending.has(replaceKey)
  const canReplace = replacementsLeft > 0 && !disabled && !replacing

  const replace = (reason: DraftReplacementReason) => {
    if (!canReplace) return
    void pending.run(replaceKey, () =>
      actions.replaceWord(option.wordId, reason),
    )
  }

  return (
    <li
      data-testid="draft-card"
      className={cx(
        'flex flex-col overflow-hidden rounded-3xl border-2 border-[#181713] bg-[#fffdf7] shadow-[4px_4px_0_#181713] transition',
        replacing && 'opacity-60',
      )}
    >
      <button
        type="button"
        disabled={disabled || replacing}
        onClick={onPick}
        aria-label={`Pick ${option.term}, ${difficultyStake(option.difficulty)}, from ${option.packName}`}
        className="group flex min-h-36 flex-1 flex-col items-start gap-3 p-4 text-left transition hover:bg-[#f8ff80] focus-visible:bg-[#f8ff80] focus-visible:outline-none disabled:cursor-wait"
      >
        <span className="flex w-full items-center justify-between gap-2">
          <DifficultyChip difficulty={option.difficulty} size="md" />
          <kbd
            aria-hidden="true"
            className="hidden rounded-lg border-2 border-black/20 px-2 font-mono text-xs font-black text-black/45 sm:inline"
          >
            {index + 1}
          </kbd>
        </span>
        <span className="text-3xl font-black leading-none tracking-[-0.04em] break-words">
          {option.term}
        </span>
        <span className="mt-auto flex w-full flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-semibold text-black/55">{option.packName}</span>
          <span
            className={cx(
              'rounded-full px-2 py-0.5 font-mono text-xs font-black',
              option.bonus > 0
                ? 'bg-[#181713] text-[#f8ff80]'
                : 'bg-black/5 text-black/55',
            )}
          >
            {option.bonus > 0 ? `+${option.bonus} pts` : 'No bonus'}
          </span>
        </span>
      </button>
      <div className="border-t-2 border-dashed border-black/15 px-3 py-2">
        <button
          type="button"
          aria-expanded={showDefinition}
          onClick={() => setShowDefinition((value) => !value)}
          className="min-h-11 w-full rounded-xl px-2 text-left text-sm font-black text-[#5c4cf2] hover:bg-black/5"
        >
          {showDefinition ? 'Hide meaning' : 'What’s this?'}
        </button>
        {showDefinition ? (
          <p className="px-2 pb-2 text-sm leading-6 text-black/70">
            {option.definition}
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <SwapButton
            disabled={!canReplace}
            onClick={() => replace('seen-before')}
          >
            Seen it
          </SwapButton>
          <SwapButton
            disabled={!canReplace}
            onClick={() => {
              // Definition first: "don't know it" is the last resort.
              if (!showDefinition) {
                setShowDefinition(true)
                return
              }
              replace('unknown-definition')
            }}
          >
            {showDefinition ? 'Still don’t know' : 'Don’t know it'}
          </SwapButton>
        </div>
        <p className="px-1 pt-1 text-[11px] font-semibold text-black/45">
          {replacementsLeft > 0
            ? `${plural(replacementsLeft, 'swap')} left`
            : 'No swaps left'}
        </p>
      </div>
    </li>
  )
}

function SwapButton({
  disabled,
  onClick,
  children,
}: {
  readonly disabled: boolean
  readonly onClick: () => void
  readonly children: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="min-h-11 rounded-xl border-2 border-[#181713] bg-white px-2 text-xs font-black transition hover:bg-[#ffd9cf] disabled:border-black/15 disabled:text-black/35 disabled:hover:bg-white"
    >
      {children}
    </button>
  )
}
