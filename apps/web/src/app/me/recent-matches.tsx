'use client'

import type { MatchSummaryRecord } from '@drawing-games/game-core'

import { Badge, type BadgeTone } from '@/components/ui/badge'
import { TeamBadge } from '@/components/ui/team-badge'
import { formatRelativeTime } from '@/lib/account/stats'
import { useNow } from '@/lib/use-now'

const RESULT: Readonly<Record<string, { label: string; tone: BadgeTone }>> = {
  win: { label: 'Win', tone: 'green' },
  loss: { label: 'Loss', tone: 'coral' },
  tie: { label: 'Tie', tone: 'lime' },
}

export function RecentMatches({
  matches,
}: {
  readonly matches: readonly MatchSummaryRecord[]
}) {
  const now = useNow()
  return (
    <section aria-labelledby="matches-heading" className="mt-10">
      <h2
        id="matches-heading"
        className="text-2xl font-black tracking-[-0.03em]"
      >
        Recent matches
      </h2>
      {matches.length === 0 ? (
        <p className="mt-4 rounded-2xl border-2 border-dashed border-black/20 p-6 text-center text-black/55">
          No finished matches yet.
        </p>
      ) : (
        // minmax(0, 1fr): the track may shrink below a card's content
        // width, so a long subtitle wraps or clamps inside its card instead
        // of widening every card past a 320 px screen.
        <ul className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
          {matches.map((match) => {
            const result = RESULT[match.result] ?? {
              label: match.result,
              tone: 'neutral' as const,
            }
            return (
              <li
                key={`${match.roomCode}-${match.matchNumber}-${match.endedAtMs}`}
                data-testid="match-card"
                // Badges stack in a narrow left column so the score and the
                // subtitle get the rest of the width, even on a 320 px phone.
                className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 rounded-2xl border-2 border-[#181713] bg-white p-4 sm:gap-x-4"
              >
                <Badge tone={result.tone} className="justify-self-start">
                  {result.label}
                </Badge>
                <p className="whitespace-nowrap text-xl font-black tabular-nums">
                  {match.teamScore}
                  <span className="mx-1 text-black/30">–</span>
                  {match.opponentScore}
                </p>
                {match.team === 'A' || match.team === 'B' ? (
                  <TeamBadge
                    team={match.team}
                    size="sm"
                    className="justify-self-start"
                  />
                ) : (
                  <span />
                )}
                <p className="line-clamp-2 break-words text-xs text-black/50">
                  {match.roundsPlayed} rounds
                  {match.withBots ? ' · with bots' : ''}
                  {match.endedReason === 'surrender' ? ' · surrender' : ''}
                  {now > 0
                    ? ` · ${formatRelativeTime(match.endedAtMs, now)}`
                    : ''}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
