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
  /**
   * Phones: each card is one ~68 px row (difficulty, term, bonus; tap to
   * pick) with its meaning and swap buttons behind a small expander, so
   * every card and its bonus fit on screen during the 15-second pick.
   */
  readonly compact?: boolean
}

/** The drawer's option cards. Keys 1–5 pick; swaps keep the difficulty. */
export function DraftCards({
  options,
  replacementsLeft,
  compact = false,
}: DraftCardsProps) {
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
    <div className={cx('grid', compact ? 'gap-2' : 'gap-3')}>
      <ol
        aria-label="Your word cards"
        className={cx(
          'grid',
          // Compact: an expanded card must not stretch its neighbors.
          compact ? 'items-start gap-2' : 'gap-3',
          options.length >= 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2',
          options.length >= 4 && 'lg:grid-cols-4',
          options.length >= 5 && 'xl:grid-cols-5',
        )}
      >
        {options.map((option, index) =>
          compact ? (
            <OptionRow
              key={option.wordId}
              option={option}
              disabled={picking}
              replacementsLeft={replacementsLeft}
              onPick={() => pick(option)}
            />
          ) : (
            <OptionCard
              key={option.wordId}
              option={option}
              index={index}
              disabled={picking}
              replacementsLeft={replacementsLeft}
              onPick={() => pick(option)}
            />
          ),
        )}
      </ol>
      <p
        className={cx(
          'font-semibold text-black/55',
          compact ? 'text-xs' : 'text-sm',
        )}
        aria-live="polite"
      >
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
  const [showDefinition, setShowDefinition] = useState(false)
  const { replacing, canReplace, replace } = useSwap(
    option,
    disabled,
    replacementsLeft,
  )
  const definition = option.definition

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
        aria-label={pickLabel(option)}
        className="group flex min-h-36 flex-1 flex-col items-start gap-3 p-4 text-left transition hover:bg-[#f8ff80] focus-visible:bg-[#f8ff80] focus-visible:outline-none disabled:cursor-wait"
      >
        <span className="flex w-full items-center justify-between gap-2">
          <span className="flex flex-wrap items-center gap-1.5">
            <DifficultyChip
              difficulty={option.difficulty}
              unrated={option.unrated}
              size="md"
            />
            {option.drawnBefore ? (
              // Only dealt once the room has run out of never-drawn words.
              <span
                data-testid="drawn-before"
                className="rounded-full border-2 border-[#181713] bg-[#ffd9cf] px-2 py-0.5 text-xs font-black"
              >
                Drawn here before
              </span>
            ) : null}
          </span>
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
            {bonusLabel(option)}
          </span>
        </span>
      </button>
      <div className="border-t-2 border-dashed border-black/15 px-3 py-2">
        {definition !== null ? (
          <>
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
                {definition}
              </p>
            ) : null}
          </>
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
              // Definition first: "don't know it" is the last resort. A
              // host's own word has none, so it swaps straight away.
              if (definition !== null && !showDefinition) {
                setShowDefinition(true)
                return
              }
              replace('unknown-definition')
            }}
          >
            {definition !== null && showDefinition
              ? 'Still don’t know'
              : 'Don’t know it'}
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

function pickLabel(option: DraftOptionView): string {
  return `Pick ${option.term}, ${difficultyStake(option.difficulty, option.unrated)}, from ${option.packName}${option.drawnBefore ? ', already drawn in this room' : ''}`
}

function bonusLabel(option: DraftOptionView): string {
  return option.bonus > 0 ? `+${option.bonus} pts` : 'No bonus'
}

/** Swapping a card for a reason; one swap at a time per card. */
function useSwap(
  option: DraftOptionView,
  disabled: boolean,
  replacementsLeft: number,
) {
  const { actions, pending } = useRoomSession()
  const replaceKey = `replace-${option.wordId}`
  const replacing = pending.has(replaceKey)
  const canReplace = replacementsLeft > 0 && !disabled && !replacing
  const replace = (reason: DraftReplacementReason) => {
    if (!canReplace) return
    void pending.run(replaceKey, () =>
      actions.replaceWord(option.wordId, reason),
    )
  }
  return { replacing, canReplace, replace }
}

/**
 * A card as one compact row for phones. The row itself picks; the `?`
 * expander shows the meaning (so "don't know it" swaps right away) and the
 * two swap buttons. On landscape phones (`sm` and up while compact) the
 * three rows sit side by side, so the bonus moves under the term.
 */
function OptionRow({
  option,
  disabled,
  replacementsLeft,
  onPick,
}: {
  readonly option: DraftOptionView
  readonly disabled: boolean
  readonly replacementsLeft: number
  readonly onPick: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const { replacing, canReplace, replace } = useSwap(
    option,
    disabled,
    replacementsLeft,
  )
  const detailsId = `draft-details-${option.wordId}`

  return (
    <li
      data-testid="draft-card"
      data-compact=""
      className={cx(
        'overflow-hidden rounded-2xl border-2 border-[#181713] bg-[#fffdf7] shadow-[3px_3px_0_#181713] transition',
        replacing && 'opacity-60',
      )}
    >
      <div className="flex items-stretch">
        <button
          type="button"
          disabled={disabled || replacing}
          onClick={onPick}
          aria-label={pickLabel(option)}
          className="flex min-h-16 min-w-0 flex-1 items-center gap-2 py-2 pl-3 pr-2 text-left transition hover:bg-[#f8ff80] focus-visible:bg-[#f8ff80] focus-visible:outline-none disabled:cursor-wait sm:flex-col sm:items-start sm:gap-1"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-1 sm:w-full sm:flex-none">
            <span className="flex min-w-0 items-center gap-1.5">
              <DifficultyChip
                difficulty={option.difficulty}
                unrated={option.unrated}
              />
              {option.drawnBefore ? (
                <span
                  data-testid="drawn-before"
                  className="shrink-0 rounded-full border-2 border-[#181713] bg-[#ffd9cf] px-1.5 text-[10px] font-black"
                >
                  Drawn before
                </span>
              ) : (
                <span className="min-w-0 truncate text-[11px] font-semibold text-black/50">
                  {option.packName}
                </span>
              )}
            </span>
            <span className="line-clamp-1 break-words text-xl font-black leading-tight tracking-[-0.03em] sm:line-clamp-2">
              {option.term}
            </span>
          </span>
          <span
            className={cx(
              'shrink-0 rounded-full px-2 py-0.5 font-mono text-xs font-black',
              option.bonus > 0
                ? 'bg-[#181713] text-[#f8ff80]'
                : 'bg-black/5 text-black/55',
            )}
          >
            {bonusLabel(option)}
          </span>
        </button>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={detailsId}
          aria-label={
            option.definition !== null
              ? `What’s this? Meaning and swaps for ${option.term}`
              : `Swaps for ${option.term}`
          }
          onClick={() => setExpanded((value) => !value)}
          className={cx(
            'grid w-12 shrink-0 place-items-center border-l-2 border-dashed border-black/15 text-base font-black text-[#5c4cf2] transition hover:bg-black/5',
            expanded && 'bg-[#efe9de]',
          )}
        >
          <span
            aria-hidden="true"
            className="grid size-7 place-items-center rounded-full border-2 border-current"
          >
            {/* No meaning to show for a host's own word: swaps only. */}
            {expanded ? '×' : option.definition !== null ? '?' : '⇄'}
          </span>
        </button>
      </div>
      {expanded ? (
        <div
          id={detailsId}
          className="border-t-2 border-dashed border-black/15 px-3 py-2"
        >
          {option.definition !== null ? (
            <p className="pb-2 text-sm leading-5 text-black/70">
              <strong className="font-black text-[#181713]">
                {option.term}:
              </strong>{' '}
              {option.definition}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
            <SwapButton
              disabled={!canReplace}
              onClick={() => replace('seen-before')}
            >
              Seen it
            </SwapButton>
            <SwapButton
              disabled={!canReplace}
              onClick={() => replace('unknown-definition')}
            >
              Don’t know it
            </SwapButton>
          </div>
        </div>
      ) : null}
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
