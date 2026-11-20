'use client'

import {
  SURRENDER_VOTE_WINDOW_MS,
  TEAM_IDS,
  TEAM_NAMES,
  otherTeam,
  type RoundResultTeamView,
  type RoundResultsView,
  type SurrenderView,
} from '@drawing-games/game-core'

import { Button } from '@/components/ui/button'
import { useCountdown } from '@/components/ui/countdown'
import { cx } from '@/components/ui/cx'
import { TEAM_COLORS, TEAM_SYMBOLS } from '@/components/ui/team-badge'

import { breakdownParts, formatSeconds, signedPoints } from '../../_lib/format'
import { useRoomSession } from '../room-session'
import { DifficultyChip } from '../shared/difficulty-chip'
import { Eyebrow, ScrollPane } from '../shared/layout'
import { ReadOnlyCanvas } from '../shared/room-canvas'

const NEXT_LABELS = {
  'word-draft': { button: 'Next round', countdown: 'Next round in' },
  showdown: { button: 'Start the showdown', countdown: 'Showdown in' },
  stats: { button: 'See final scores', countdown: 'Final scores in' },
} as const

/** Both words, both drawings, and exactly where the points came from. */
export function ResultsScreen({
  results,
}: {
  readonly results: RoundResultsView
}) {
  const { view, me, actions, pending, serverNow } = useRoomSession()
  const { secondsLeft } = useCountdown(view.phaseDeadlineAtMs, serverNow)
  const next = NEXT_LABELS[results.nextPhase]
  const winner = results.winner

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollPane>
        <div className="mx-auto grid w-full max-w-5xl gap-4 px-3 py-4 sm:px-5 sm:py-6">
          <header aria-live="polite">
            <Eyebrow>Round {results.roundNumber} results</Eyebrow>
            <h2
              className="text-3xl font-black tracking-[-0.04em] sm:text-4xl"
              data-testid="round-winner"
            >
              {winner
                ? `${TEAM_SYMBOLS[winner]} ${TEAM_NAMES[winner]} takes round ${results.roundNumber}!`
                : results.teams.A.solved || results.teams.B.solved
                  ? 'Dead heat — round tied'
                  : 'Nobody cracked it this time'}
            </h2>
            {winner && results.shutdownBonus > 0 ? (
              <p className="mt-2 inline-flex flex-wrap items-center gap-2 rounded-2xl border-2 border-[#181713] bg-[#f8ff80] px-3 py-2 text-sm font-black shadow-[3px_3px_0_#181713]">
                <span aria-hidden="true">⚡</span>
                Shutdown bonus {signedPoints(results.shutdownBonus)} —{' '}
                {TEAM_NAMES[winner]} snapped {TEAM_NAMES[otherTeam(winner)]}’s
                win streak.
              </p>
            ) : null}
          </header>

          {/* First, so the trailing team sees it without scrolling. */}
          {view.surrender?.eligible ? (
            <SurrenderPrompt surrender={view.surrender} />
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            {TEAM_IDS.map((team) => (
              <TeamResult
                key={team}
                result={results.teams[team]}
                won={winner === team}
                shutdown={winner === team ? results.shutdownBonus : 0}
                mine={me.team === team}
              />
            ))}
          </div>

          <section
            aria-label="Scores"
            className="grid grid-cols-2 gap-3"
            data-testid="results-scores"
          >
            {TEAM_IDS.map((team) => (
              <div
                key={team}
                className="rounded-2xl border-2 border-[#181713] px-4 py-3 text-white"
                style={{ backgroundColor: TEAM_COLORS[team] }}
              >
                <p className="text-sm font-black">
                  <span aria-hidden="true">{TEAM_SYMBOLS[team]} </span>
                  {TEAM_NAMES[team]}
                </p>
                <p className="font-mono text-3xl font-black tabular-nums">
                  {results.scores[team]}
                  <span className="sr-only"> points</span>
                </p>
              </div>
            ))}
          </section>
        </div>
      </ScrollPane>

      <div className="shrink-0 border-t-2 border-[#181713] bg-[#fffdf7] px-3 py-3 sm:px-5">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-black" aria-live="off">
            {next.countdown}{' '}
            <span className="font-mono tabular-nums">
              {secondsLeft ?? '…'}s
            </span>
          </p>
          {results.canContinue ? (
            <Button
              size="lg"
              loading={pending.has('continue')}
              onClick={() =>
                void pending.run('continue', () => actions.continueRound())
              }
            >
              {next.button}
            </Button>
          ) : results.continueHeldBy !== null ? (
            <p
              className="text-sm font-semibold text-black/65"
              data-testid="surrender-hold"
            >
              {results.continueHeldBy === me.team
                ? 'Your team can still vote to surrender.'
                : `${TEAM_NAMES[results.continueHeldBy]} can still vote to surrender.`}
            </p>
          ) : (
            <p className="text-sm text-black/55">The host can skip ahead.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function TeamResult({
  result,
  won,
  shutdown,
  mine,
}: {
  readonly result: RoundResultTeamView
  readonly won: boolean
  readonly shutdown: number
  readonly mine: boolean
}) {
  const name = TEAM_NAMES[result.team]
  const total = result.points + shutdown
  return (
    <article
      aria-label={`${name} this round`}
      className={cx(
        'overflow-hidden rounded-3xl border-2 border-[#181713] bg-[#fffdf7]',
        won ? 'shadow-[6px_6px_0_#181713]' : 'shadow-[3px_3px_0_#181713]',
      )}
    >
      <header
        className="flex items-center gap-2 border-b-2 border-[#181713] px-4 py-2.5 text-white"
        style={{ backgroundColor: TEAM_COLORS[result.team] }}
      >
        <span className="font-black">
          <span aria-hidden="true">{TEAM_SYMBOLS[result.team]} </span>
          {name}
          {mine ? (
            <span className="ml-1 text-xs font-bold text-white/75">(you)</span>
          ) : null}
        </span>
        {won ? (
          <span className="ml-auto rounded-full bg-[#f8ff80] px-2 py-0.5 text-xs font-black text-[#181713]">
            Round winner
          </span>
        ) : null}
      </header>
      <div className="grid gap-3 p-4">
        <div>
          <p className="text-xs font-semibold text-black/55">
            {result.drawerName} drew
          </p>
          <p className="flex flex-wrap items-center gap-2">
            <strong
              className="text-2xl font-black tracking-[-0.03em]"
              data-testid="result-word"
            >
              {result.term}
            </strong>
            <DifficultyChip
              difficulty={result.difficulty}
              unrated={result.unrated}
              showBonus
            />
            <span className="text-xs font-semibold text-black/50">
              {result.packName}
            </span>
          </p>
        </div>
        <ReadOnlyCanvas
          canvasId={result.canvasId}
          label={`${name}'s drawing of ${result.term}`}
          className="aspect-[4/3] w-full"
        />
        {result.solved && result.breakdown ? (
          <div className="grid gap-2">
            <p className="text-sm font-black">
              {result.solverName} solved it
              {result.solveSeconds !== null
                ? ` in ${formatSeconds(result.solveSeconds)}`
                : ''}
            </p>
            <dl className="grid gap-1 rounded-2xl bg-black/[0.04] p-3 text-sm">
              {breakdownParts(
                result.breakdown,
                result.difficulty,
                result.unrated,
              ).map((part) => (
                <div key={part.label} className="flex justify-between gap-2">
                  <dt className="text-black/65">{part.label}</dt>
                  <dd className="font-mono font-black tabular-nums">
                    {signedPoints(part.points)}
                  </dd>
                </div>
              ))}
              {shutdown > 0 ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-black/65">Shutdown bonus</dt>
                  <dd className="font-mono font-black tabular-nums">
                    {signedPoints(shutdown)}
                  </dd>
                </div>
              ) : null}
              <div className="mt-1 flex justify-between gap-2 border-t-2 border-black/10 pt-1">
                <dt className="font-black">Round total</dt>
                <dd className="font-mono text-base font-black tabular-nums">
                  {signedPoints(total)}
                </dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="rounded-2xl bg-black/[0.04] p-3 text-sm font-semibold text-black/60">
            Not solved · 0 points
          </p>
        )}
      </div>
    </article>
  )
}

function SurrenderPrompt({ surrender }: { readonly surrender: SurrenderView }) {
  const { actions, pending } = useRoomSession()
  const voted = surrender.myVote
  return (
    <section
      aria-labelledby="surrender-heading"
      className="rounded-3xl border-2 border-[#181713] bg-[#ffd9cf] p-4 shadow-[3px_3px_0_#181713]"
      data-testid="surrender-prompt"
    >
      <h3 id="surrender-heading" className="text-lg font-black">
        Call it here?
      </h3>
      <p className="mt-1 text-sm leading-6 text-black/70" aria-live="polite">
        {TEAM_NAMES[surrender.team]} is far behind. If enough of your team
        agrees, the match ends now and the other team wins. The first yes gives
        everyone at least {SURRENDER_VOTE_WINDOW_MS / 1000} seconds to answer.
        Votes:{' '}
        <span className="font-mono font-black tabular-nums">
          {surrender.votesFor}/{surrender.votesNeeded}
        </span>
        .
      </p>
      {surrender.canVote ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant={voted === true ? 'dark' : 'secondary'}
            aria-pressed={voted === true}
            loading={pending.has('surrender-yes')}
            onClick={() =>
              void pending.run('surrender-yes', () =>
                actions.voteSurrender(true),
              )
            }
          >
            Yes, surrender
          </Button>
          <Button
            variant={voted === false ? 'dark' : 'secondary'}
            aria-pressed={voted === false}
            loading={pending.has('surrender-no')}
            onClick={() =>
              void pending.run('surrender-no', () =>
                actions.voteSurrender(false),
              )
            }
          >
            No, keep playing
          </Button>
        </div>
      ) : null}
    </section>
  )
}
