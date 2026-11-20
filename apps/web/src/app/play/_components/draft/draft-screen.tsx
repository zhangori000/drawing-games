'use client'

import {
  DIFFICULTY_BONUSES,
  ownWordCluesAllowed,
  TEAM_NAMES,
  WORD_DIFFICULTIES,
  type MyTeamRoundView,
  type OpponentRoundView,
  type RoundView,
} from '@drawing-games/game-core'

import { useCountdown } from '@/components/ui/countdown'
import { cx } from '@/components/ui/cx'
import { TEAM_COLORS, TEAM_SYMBOLS } from '@/components/ui/team-badge'

import { difficultyStake, plural } from '../../_lib/format'
import { useCompactScreen } from '../../_lib/use-media-query'
import { useRoomSession } from '../room-session'
import { DifficultyChip } from '../shared/difficulty-chip'
import { Card, Eyebrow, ScrollPane } from '../shared/layout'
import { DraftCards } from './draft-cards'

/** Both drawers pick their team's word at the same time. */
export function DraftScreen({ round }: { readonly round: RoundView }) {
  const { serverNow } = useRoomSession()
  const { secondsLeft, urgent } = useCountdown(
    round.draftDeadlineAtMs,
    serverNow,
  )
  // Phones: the top bar already shows the countdown, so the big copy goes
  // and the cards become compact rows that all fit on screen.
  const compact = useCompactScreen()
  const mine = round.mine
  const opponent = round.opponent
  if (!mine) return null

  return (
    <ScrollPane>
      <div
        className={cx(
          'mx-auto grid w-full max-w-5xl px-3 sm:px-5',
          compact ? 'gap-3 py-3' : 'gap-4 py-4 sm:py-6',
        )}
      >
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Eyebrow>Round {round.number} · word draft</Eyebrow>
            <h2
              className={cx(
                'font-black tracking-[-0.04em]',
                compact ? 'text-2xl' : 'text-3xl sm:text-4xl',
              )}
            >
              {mine.amDrawer
                ? mine.chosen
                  ? 'Locked in!'
                  : 'Pick your team’s word'
                : mine.chosen
                  ? `${mine.drawerName} picked a word`
                  : `${mine.drawerName} is picking your word…`}
            </h2>
          </div>
          {secondsLeft !== null && !compact ? (
            <p
              className={cx(
                'rounded-2xl border-2 border-[#181713] px-4 py-2 font-mono text-2xl font-black tabular-nums',
                urgent
                  ? 'animate-urgent-pulse bg-[#ff6b4a] text-[#181713] motion-reduce:animate-none'
                  : 'bg-white',
              )}
              aria-hidden="true"
            >
              {secondsLeft}s
            </p>
          ) : null}
        </header>

        {mine.amDrawer ? (
          <DrawerDraft mine={mine} compact={compact} />
        ) : (
          <TeammateDraft mine={mine} />
        )}
        {opponent ? <OpponentDraft opponent={opponent} /> : null}
      </div>
    </ScrollPane>
  )
}

function DrawerDraft({
  mine,
  compact,
}: {
  readonly mine: MyTeamRoundView
  readonly compact: boolean
}) {
  if (mine.chosen && mine.word) {
    return (
      <Card className="grid gap-2 bg-[#f8ff80]">
        <p className="text-sm font-bold text-black/60">You’ll draw</p>
        <p className="flex flex-wrap items-center gap-3">
          <strong
            data-testid="drawer-word"
            className="text-4xl font-black tracking-[-0.04em]"
          >
            {mine.word.term}
          </strong>
          <DifficultyChip
            difficulty={mine.word.difficulty}
            showBonus
            size="md"
          />
        </p>
        <p className="text-sm text-black/60">
          Drawing starts as soon as the other drawer picks. Get your idea ready!
        </p>
      </Card>
    )
  }
  return (
    <div className={cx('grid', compact ? 'gap-2' : 'gap-3')}>
      {compact ? (
        <p className="text-sm leading-5 text-black/65">
          Tap a word to pick it; harder ones earn a bigger bonus. Tap{' '}
          <span className="font-black text-[#5c4cf2]">?</span> for its meaning
          or to swap it.
        </p>
      ) : (
        <p className="text-sm leading-6 text-black/65">
          Tap a card to pick it (or press its number). Harder words score a
          bigger bonus if your team solves them. Not sure what one means? Tap{' '}
          <em>What’s this?</em> first.
        </p>
      )}
      <DraftCards
        options={mine.options ?? []}
        replacementsLeft={mine.replacementsLeft ?? 0}
        compact={compact}
      />
    </div>
  )
}

function TeammateDraft({ mine }: { readonly mine: MyTeamRoundView }) {
  const { view } = useRoomSession()
  // With the cards shown to opponents, the room sends guessers no clue
  // about which card was picked (not even its difficulty).
  const clues = ownWordCluesAllowed(view.settings)
  return (
    <Card className="grid gap-4">
      {mine.chosen && mine.difficulty ? (
        <p className="flex flex-wrap items-center gap-2 text-lg font-black">
          Your word is
          <DifficultyChip difficulty={mine.difficulty} showBonus size="md" />—
          get ready to guess!
        </p>
      ) : mine.chosen ? (
        <p className="text-lg font-black">
          {mine.drawerName} locked in a word—get ready to guess!
        </p>
      ) : (
        <p className="text-base leading-7 text-black/70">
          You’ll see what {mine.drawerName} draws and race the clock to guess
          it.{' '}
          {clues
            ? 'You only learn how hard it is, never the word.'
            : 'The other team can see the cards, so you get no clues about which one was picked. You’ll see its bonus in the results.'}
        </p>
      )}
      <div>
        <p className="mb-2 text-sm font-black">What a solve is worth</p>
        <ul className="flex flex-wrap gap-2">
          {WORD_DIFFICULTIES.map((difficulty) => (
            <li key={difficulty}>
              <DifficultyChip difficulty={difficulty} size="md" />
              <span className="sr-only">: </span>
              <span className="ml-1 text-sm font-semibold text-black/60">
                50–100 speed{' '}
                {DIFFICULTY_BONUSES[difficulty] > 0
                  ? `+ ${DIFFICULTY_BONUSES[difficulty]}`
                  : ''}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}

function OpponentDraft({ opponent }: { readonly opponent: OpponentRoundView }) {
  const name = TEAM_NAMES[opponent.team]
  const swaps = opponent.actions ?? []
  const seen = swaps.filter((action) => action.reason === 'seen-before').length
  const unknown = swaps.length - seen
  return (
    <section
      aria-labelledby="opponent-draft-heading"
      className="rounded-3xl border-2 border-dashed border-[#181713]/40 p-4"
    >
      <h3
        id="opponent-draft-heading"
        className="flex flex-wrap items-center gap-2 text-base font-black"
      >
        <span
          className="inline-flex items-center gap-1 rounded-full border-2 border-[#181713] px-2 py-0.5 text-sm text-white"
          style={{ backgroundColor: TEAM_COLORS[opponent.team] }}
        >
          <span aria-hidden="true">{TEAM_SYMBOLS[opponent.team]}</span>
          {name}
        </span>
        {opponent.drawerName} is {opponent.chosen ? 'locked in' : 'choosing'}
        {opponent.chosen ? <span aria-hidden="true">✓</span> : null}
      </h3>
      {opponent.options ? (
        <ul
          className="mt-3 flex flex-wrap gap-2"
          aria-label={`${name}'s cards`}
        >
          {opponent.options.map((option) => (
            <li
              key={`${option.term}-${option.difficulty}`}
              className="flex items-center gap-2 rounded-2xl border-2 border-black/15 bg-white px-3 py-2 text-sm font-black"
            >
              {option.term}
              <span className="sr-only">
                , {difficultyStake(option.difficulty)}
              </span>
              <DifficultyChip difficulty={option.difficulty} />
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-2 text-sm text-black/55">
        {opponent.actions === null
          ? opponent.options
            ? ''
            : `${name}’s draft is hidden in this room.`
          : swaps.length === 0
            ? 'No swaps yet.'
            : [
                seen > 0
                  ? `${plural(seen, 'card')} swapped as “seen it”`
                  : null,
                unknown > 0
                  ? `${plural(unknown, 'card')} swapped as “don’t know it”`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
        {opponent.options ? ' You won’t see which one they pick.' : ''}
      </p>
    </section>
  )
}
