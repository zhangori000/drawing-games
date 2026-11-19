'use client'

import { TEAM_IDS, TEAM_NAMES } from '@drawing-games/game-core'

import { cx } from '@/components/ui/cx'
import { TEAM_COLORS, TEAM_SYMBOLS } from '@/components/ui/team-badge'

import { plural } from '../../_lib/format'
import { useMembers, useRoomSession } from '../room-session'

/** Both teams' totals and who is drawing — the wide-screen sidebar footer. */
export function Scoreboard({ className }: { readonly className?: string }) {
  const { view, me } = useRoomSession()
  const members = useMembers()
  const leader =
    view.teams.A.score === view.teams.B.score
      ? null
      : view.teams.A.score > view.teams.B.score
        ? 'A'
        : 'B'

  return (
    <section
      aria-label="Scoreboard"
      data-testid="scoreboard"
      className={cx('grid grid-cols-2 gap-2', className)}
    >
      {TEAM_IDS.map((team) => {
        const info = view.teams[team]
        const roster = members.team(team)
        return (
          <div
            key={team}
            className={cx(
              'rounded-2xl border-2 border-[#181713] bg-[#fffdf7] p-2.5',
              leader === team && 'shadow-[3px_3px_0_#181713]',
            )}
          >
            <p className="flex items-center justify-between gap-1">
              <span
                className="inline-flex items-center gap-1 text-sm font-black"
                style={{ color: TEAM_COLORS[team] }}
              >
                <span aria-hidden="true">{TEAM_SYMBOLS[team]}</span>
                {TEAM_NAMES[team]}
              </span>
              {me.team === team ? (
                <span className="text-[10px] font-bold uppercase text-black/45">
                  You
                </span>
              ) : null}
            </p>
            <p className="font-mono text-2xl font-black tabular-nums">
              {info.score}
              <span className="sr-only"> points</span>
            </p>
            <p className="text-xs font-semibold text-black/55">
              {plural(info.roundsWon, 'round')} won
            </p>
            <ul className="mt-1.5 grid gap-0.5 text-xs">
              {roster.map((member) => (
                <li
                  key={member.id}
                  className={cx(
                    'flex items-center gap-1 truncate',
                    !member.connected && 'opacity-50',
                  )}
                >
                  <span aria-hidden="true" className="w-3 shrink-0">
                    {member.isDrawer ? '✎' : ''}
                  </span>
                  <span
                    className={cx(
                      'truncate',
                      member.id === me.memberId && 'font-black',
                    )}
                  >
                    {member.displayName}
                  </span>
                  {member.isDrawer ? (
                    <span className="sr-only"> (drawing)</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </section>
  )
}
