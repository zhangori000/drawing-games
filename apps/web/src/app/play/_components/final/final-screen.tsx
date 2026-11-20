'use client'

import {
  TEAM_IDS,
  TEAM_NAMES,
  otherTeam,
  type FinalRoundView,
  type FinalView,
  type TeamId,
} from '@drawing-games/game-core'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'

import { Button, buttonClassName } from '@/components/ui/button'
import { cx } from '@/components/ui/cx'
import { TEAM_COLORS, TEAM_SYMBOLS } from '@/components/ui/team-badge'

import {
  finalAccountStatus,
  playedFinishedMatch,
  type FinalAccountStatus,
} from '../../_lib/account-status'
import { formatSeconds, plural } from '../../_lib/format'
import { useRoomSession } from '../room-session'
import { DifficultyChip } from '../shared/difficulty-chip'
import { Eyebrow, ScrollPane } from '../shared/layout'
import { CanvasThumb } from '../shared/room-canvas'
import { AccountLinkModal, type LinkPurpose } from './account-link-modal'
import { StatsTable } from './stats-table'

/** Match recap: winner, the numbers behind it, every round, and what next. */
export function FinalScreen({ final }: { readonly final: FinalView }) {
  const { me } = useRoomSession()
  const status = finalAccountStatus(me)
  // What the dialog offers, fixed when it opens: the status changes as soon
  // as the link lands, while the dialog is still closing.
  const [linking, setLinking] = useState<LinkPurpose | null>(null)
  const [justLinked, setJustLinked] = useState(false)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollPane>
        <div className="mx-auto grid w-full max-w-5xl gap-5 px-3 py-4 sm:px-5 sm:py-6">
          <WinnerBanner final={final} />
          <Facts final={final} />
          <AccountStatusPanel
            status={status}
            focusAfterLink={justLinked}
            onLink={() =>
              setLinking(
                status.kind === 'can-save' ? 'this-match' : 'next-matches',
              )
            }
          />
          <section aria-labelledby="stats-heading" className="grid gap-2">
            <h3
              id="stats-heading"
              className="px-1 text-xl font-black tracking-[-0.02em]"
            >
              Who did what
            </h3>
            <StatsTable
              members={final.members}
              myId={me.memberId}
              showdown={final.showdown !== null}
            />
          </section>
          <Timeline rounds={final.rounds} />
        </div>
      </ScrollPane>
      <FinalActions final={final} />
      <AccountLinkModal
        open={linking !== null}
        purpose={linking ?? 'this-match'}
        onClose={() => setLinking(null)}
        onLinked={() => {
          setLinking(null)
          setJustLinked(true)
        }}
      />
    </div>
  )
}

/**
 * Moves focus to `ref` once the sign-up dialog has closed (and stopped
 * making the page inert), so keyboard and screen-reader users land on the
 * result of linking.
 */
function useFocusAfterLink(
  ref: RefObject<HTMLElement | null>,
  focusAfterLink: boolean,
): void {
  useEffect(() => {
    if (!focusAfterLink) return
    const id = window.setTimeout(
      () => ref.current?.focus({ preventScroll: true }),
      0,
    )
    return () => window.clearTimeout(id)
  }, [focusAfterLink, ref])
}

const PANEL =
  'rounded-3xl border-2 border-[#181713] bg-[#ded9ff] p-4 outline-none focus-visible:ring-4 focus-visible:ring-[#5c4cf2]/40'

/**
 * Says what happened to this match for this seat's account, only as the
 * room recorded it: saved here, saved to an account the seat had earlier,
 * or nothing to save (the seat joined after it). A guest who played gets
 * the offer to keep it.
 */
function AccountStatusPanel({
  status,
  focusAfterLink,
  onLink,
}: {
  readonly status: FinalAccountStatus
  /** Just linked from the sign-up dialog: move focus here once it closes. */
  readonly focusAfterLink: boolean
  readonly onLink: () => void
}) {
  const panelRef = useRef<HTMLElement>(null)
  useFocusAfterLink(panelRef, focusAfterLink && status.kind !== 'saved')
  switch (status.kind) {
    case 'saved':
      return (
        <StatsSaved username={status.username} focusLink={focusAfterLink} />
      )
    case 'can-save':
      return (
        <AccountOffer
          heading="Create a quick account to keep your stats"
          onLink={onLink}
        >
          Username and password only — no email. It saves this match, and from
          then on your word history and match stats follow you, and you won’t be
          offered words you’ve already drawn.
        </AccountOffer>
      )
    case 'saved-elsewhere':
      return status.username === null ? (
        <AccountOffer
          heading={`This match is saved to @${status.savedTo}`}
          buttonLabel="Log in or sign up"
          onLink={onLink}
        >
          This seat is signed out now. Log in again (or create another quick
          account) to save your next matches here.
        </AccountOffer>
      ) : (
        <section
          ref={panelRef}
          tabIndex={-1}
          data-testid="stats-saved-elsewhere"
          aria-label="Where this match is saved"
          className={cx(PANEL, 'py-3 text-sm leading-6')}
        >
          <strong className="font-black">
            This match is saved to @{status.savedTo}
          </strong>
          <span className="text-black/65">
            {' '}
            · You’re signed in as @{status.username} now, so your next matches
            here are saved there.
          </span>
        </section>
      )
    case 'next-only': {
      const why = status.played
        ? 'Nothing from this match was saved.'
        : 'You didn’t play in this match, so there’s nothing from it to save.'
      return status.username === null ? (
        <AccountOffer heading="Save your next matches" onLink={onLink}>
          {why} A quick account — username and password, no email — keeps your
          word history and match stats from your next match on.
        </AccountOffer>
      ) : (
        <section
          ref={panelRef}
          tabIndex={-1}
          data-testid="stats-next-only"
          aria-label="Stats from the next match"
          className={cx(PANEL, 'py-3 text-sm leading-6')}
        >
          <strong className="font-black">
            Signed in as @{status.username}
          </strong>
          <span className="text-black/65">
            {' '}
            · {why} Your next matches here will be saved.
          </span>
        </section>
      )
    }
  }
}

function AccountOffer({
  heading,
  buttonLabel = 'Create a quick account',
  onLink,
  children,
}: {
  readonly heading: string
  readonly buttonLabel?: string
  readonly onLink: () => void
  readonly children: ReactNode
}) {
  return (
    <section
      data-testid="account-prompt"
      className={cx(PANEL, 'grid gap-3 sm:flex sm:items-center')}
    >
      <p className="min-w-0 flex-1 text-sm leading-6">
        <strong className="block text-base font-black">{heading}</strong>
        {children}
      </p>
      <Button variant="primary" onClick={onLink}>
        {buttonLabel}
      </Button>
    </section>
  )
}

/**
 * Confirms where this match went once the seat's account has it: right
 * after signing up here, or for a player who was signed in all along. /me
 * opens in a new tab so the player keeps their seat for a rematch.
 */
function StatsSaved({
  username,
  focusLink,
}: {
  readonly username: string
  /** Just linked from the sign-up dialog: move focus here once it closes. */
  readonly focusLink: boolean
}) {
  const linkRef = useRef<HTMLAnchorElement>(null)
  useFocusAfterLink(linkRef, focusLink)
  return (
    <section
      data-testid="stats-saved"
      aria-label="Stats saved"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-3xl border-2 border-[#181713] bg-[#ded9ff] px-4 py-3"
    >
      <p className="min-w-0 flex-1 text-sm leading-6">
        <span
          aria-hidden="true"
          className="mr-2 inline-grid size-6 place-items-center rounded-full bg-[#181713] align-middle text-xs font-black text-[#f8ff80]"
        >
          ✓
        </span>
        <strong className="font-black">Stats saved to @{username}</strong>
        <span className="text-black/65"> · this match is in your history.</span>
      </p>
      <Link
        ref={linkRef}
        href="/me"
        target="_blank"
        className={buttonClassName('secondary', 'sm')}
      >
        See your stats
        <span className="sr-only"> (opens in a new tab)</span>
      </Link>
    </section>
  )
}

function WinnerBanner({ final }: { readonly final: FinalView }) {
  const { me } = useRoomSession()
  const winner = final.winner
  const loser = winner ? otherTeam(winner) : null
  const headline = winner
    ? `${TEAM_SYMBOLS[winner]} ${TEAM_NAMES[winner]} wins!`
    : 'It’s a tie!'
  const sub =
    final.endedReason === 'surrender' && loser
      ? `${TEAM_NAMES[loser]} surrendered.`
      : winner === null
        ? 'Dead level after every round. Rematch?'
        : !playedFinishedMatch(me)
          ? 'You didn’t play this one. You’re in for the rematch.'
          : winner === me.team
            ? 'Your team took it. Nicely drawn.'
            : 'So close. Run it back?'
  return (
    <section
      aria-labelledby="final-heading"
      className="rounded-3xl border-2 border-[#181713] p-5 text-white shadow-[6px_6px_0_#181713] sm:p-7"
      style={{ backgroundColor: winner ? TEAM_COLORS[winner] : '#181713' }}
    >
      <Eyebrow className="text-white/70">Final score</Eyebrow>
      <h2
        id="final-heading"
        aria-live="polite"
        data-testid="final-winner"
        className="mt-1 text-4xl font-black tracking-[-0.05em] sm:text-6xl"
      >
        {headline}
      </h2>
      <p className="mt-2 text-base font-semibold text-white/85">{sub}</p>
      <div
        className="mt-5 flex flex-wrap items-end gap-6"
        data-testid="final-scores"
      >
        {TEAM_IDS.map((team) => (
          <p
            key={team}
            className={cx(team !== winner && winner !== null && 'opacity-75')}
          >
            <span className="block text-sm font-black">
              <span aria-hidden="true">{TEAM_SYMBOLS[team]} </span>
              {TEAM_NAMES[team]}
            </span>
            <span className="font-mono text-5xl font-black tabular-nums">
              {final.scores[team]}
            </span>
          </p>
        ))}
      </div>
    </section>
  )
}

function Facts({ final }: { readonly final: FinalView }) {
  const showdown = final.showdown
  const facts: {
    label: string
    value: (team: TeamId) => string
    note?: string
  }[] = [
    { label: 'Rounds won', value: (team) => String(final.roundsWon[team]) },
    {
      label: 'Largest lead',
      value: (team) =>
        final.largestLead[team] > 0 ? `+${final.largestLead[team]}` : '—',
    },
  ]
  if (showdown) {
    facts.push({
      label: 'Showdown',
      value: (team) =>
        `${showdown.cleared[team]}/${showdown.cardCounts[team]} · +${showdown.points[team]}`,
      note: showdown.firstClearTeam
        ? `${TEAM_NAMES[showdown.firstClearTeam]} finished first`
        : 'Nobody cleared every card',
    })
  }
  return (
    <dl className="grid gap-3 sm:grid-cols-3">
      {facts.map((fact) => (
        <div
          key={fact.label}
          className="rounded-2xl border-2 border-[#181713] bg-[#fffdf7] p-3"
        >
          <dt className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-black/55">
            {fact.label}
          </dt>
          <dd className="mt-1 flex items-baseline gap-3">
            {TEAM_IDS.map((team) => (
              <span
                key={team}
                className="font-mono text-xl font-black tabular-nums"
                style={{ color: TEAM_COLORS[team] }}
              >
                <span aria-hidden="true">{TEAM_SYMBOLS[team]}</span>
                <span className="sr-only">{TEAM_NAMES[team]}: </span>{' '}
                {fact.value(team)}
              </span>
            ))}
          </dd>
          {fact.note ? (
            <p className="mt-1 text-xs font-semibold text-black/55">
              {fact.note}
            </p>
          ) : null}
        </div>
      ))}
    </dl>
  )
}

function Timeline({ rounds }: { readonly rounds: readonly FinalRoundView[] }) {
  if (rounds.length === 0) return null
  return (
    <section aria-labelledby="timeline-heading" className="grid gap-3">
      <h3
        id="timeline-heading"
        className="px-1 text-xl font-black tracking-[-0.02em]"
      >
        Round by round
      </h3>
      <ol className="grid gap-3">
        {rounds.map((round) => (
          <li
            key={round.number}
            className="rounded-3xl border-2 border-[#181713] bg-[#fffdf7] p-3 sm:p-4"
          >
            <p className="mb-2 flex items-center gap-2 text-sm font-black">
              Round {round.number}
              {round.winner ? (
                <span
                  className="rounded-full border-2 border-[#181713] px-2 py-0.5 text-xs text-white"
                  style={{ backgroundColor: TEAM_COLORS[round.winner] }}
                >
                  {TEAM_SYMBOLS[round.winner]} {TEAM_NAMES[round.winner]} won
                </span>
              ) : (
                <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs">
                  Tied
                </span>
              )}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {TEAM_IDS.map((team) => {
                const entry = round.teams[team]
                return (
                  <div
                    key={team}
                    className="grid content-start gap-1.5 md:grid-cols-[11rem_minmax(0,1fr)] md:gap-x-3"
                  >
                    <CanvasThumb
                      className="md:row-span-2"
                      canvasId={entry.canvasId}
                      label={`${TEAM_NAMES[team]}: ${entry.drawerName}'s drawing of ${entry.term}`}
                    />
                    <p className="flex flex-wrap items-center gap-1.5">
                      <strong className="font-black">{entry.term}</strong>
                      <DifficultyChip difficulty={entry.difficulty} />
                    </p>
                    <p className="text-xs leading-5 text-black/60">
                      <span
                        style={{ color: TEAM_COLORS[team] }}
                        aria-hidden="true"
                      >
                        {TEAM_SYMBOLS[team]}{' '}
                      </span>
                      {entry.drawerName} drew ·{' '}
                      {entry.solved
                        ? `${entry.solverName ?? 'someone'} got it${entry.solveSeconds !== null ? ` in ${formatSeconds(entry.solveSeconds)}` : ''} · ${plural(entry.points, 'pt')}`
                        : 'not solved'}
                    </p>
                  </div>
                )
              })}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

function FinalActions({ final }: { readonly final: FinalView }) {
  const { actions, pending } = useRoomSession()
  const router = useRouter()
  const home = () =>
    pending.run('home', async () => {
      await actions.leave()
      router.push('/')
    })
  return (
    <div className="shrink-0 border-t-2 border-[#181713] bg-[#fffdf7] px-3 py-3 sm:px-5">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2">
        {final.canRematch ? (
          <>
            <Button
              size="lg"
              variant="success"
              loading={pending.has('rematch-same')}
              onClick={() =>
                void pending.run('rematch-same', () =>
                  actions.rematch('same-settings'),
                )
              }
            >
              Run it back
            </Button>
            <Button
              size="lg"
              variant="secondary"
              loading={pending.has('rematch-change')}
              onClick={() =>
                void pending.run('rematch-change', () =>
                  actions.rematch('change-settings'),
                )
              }
            >
              Change settings
            </Button>
          </>
        ) : (
          <p className="text-sm font-semibold text-black/60">
            Waiting for the host to start a rematch…
          </p>
        )}
        <Button
          size="lg"
          variant="ghost"
          className="ml-auto"
          loading={pending.has('home')}
          onClick={() => void home()}
        >
          Back to home
        </Button>
      </div>
    </div>
  )
}
