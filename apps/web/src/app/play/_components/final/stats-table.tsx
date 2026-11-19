import { TEAM_NAMES, type FinalView } from '@drawing-games/game-core'
import type { ReactNode } from 'react'

import { cx } from '@/components/ui/cx'
import { TEAM_COLORS, TEAM_SYMBOLS } from '@/components/ui/team-badge'

import { formatMs } from '../../_lib/format'

type FinalMember = FinalView['members'][number]

/**
 * Different kinds of contribution side by side — drawing, guessing, close
 * calls — rather than one "best player" number. Scrolls sideways on phones.
 */
export function StatsTable({
  members,
  myId,
  showdown,
}: {
  readonly members: readonly FinalMember[]
  readonly myId: string
  /** Show the showdown column (only when the match had one). */
  readonly showdown: boolean
}) {
  const sorted = [...members].sort((left, right) =>
    left.team === right.team ? 0 : left.team === 'A' ? -1 : 1,
  )
  return (
    <div className="overflow-x-auto overscroll-x-contain rounded-3xl border-2 border-[#181713] bg-[#fffdf7]">
      <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
        <caption className="sr-only">Per-player stats for this match</caption>
        <thead>
          <tr className="border-b-2 border-[#181713] font-mono text-[11px] uppercase tracking-[0.12em] text-black/55">
            <th scope="col" className="px-3 py-2">
              Player
            </th>
            <th scope="col" className="px-2 py-2 text-right">
              Drawings solved
            </th>
            <th scope="col" className="px-2 py-2 text-right">
              Correct guesses
            </th>
            <th scope="col" className="px-2 py-2 text-right">
              Accuracy
            </th>
            <th scope="col" className="px-2 py-2 text-right">
              Fastest
            </th>
            <th scope="col" className="px-2 py-2 text-right">
              Close calls
            </th>
            <th scope="col" className="px-2 py-2 text-right">
              Hard words
            </th>
            <th scope="col" className="px-2 py-2 text-right">
              Points won
            </th>
            {showdown ? (
              <th scope="col" className="px-3 py-2 text-right">
                Showdown cards
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {sorted.map((member) => {
            const stats = member.stats
            const accuracy =
              stats.guessesSubmitted > 0
                ? `${Math.round((stats.correctGuesses / stats.guessesSubmitted) * 100)}%`
                : '—'
            return (
              <tr
                key={member.memberId}
                className={cx(
                  'border-b border-black/10 last:border-b-0',
                  member.memberId === myId && 'bg-[#f8ff80]/50',
                )}
              >
                <th scope="row" className="px-3 py-2 font-black">
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      style={{ color: TEAM_COLORS[member.team] }}
                    >
                      {TEAM_SYMBOLS[member.team]}
                    </span>
                    <span className="sr-only">{TEAM_NAMES[member.team]}: </span>
                    <span className="truncate">{member.displayName}</span>
                    {member.kind === 'bot' ? (
                      <span className="rounded-full bg-[#181713] px-1.5 text-[10px] font-black uppercase text-white">
                        Bot
                      </span>
                    ) : null}
                  </span>
                </th>
                <Cell>
                  {stats.drawingsSolved}/{stats.roundsDrawn}
                </Cell>
                <Cell>
                  {stats.correctGuesses}/{stats.guessesSubmitted}
                </Cell>
                <Cell>{accuracy}</Cell>
                <Cell>{formatMs(stats.fastestCorrectMs)}</Cell>
                <Cell>{stats.closeGuesses}</Cell>
                <Cell>{stats.hardWordsSolved}</Cell>
                <Cell strong>{stats.pointsWon}</Cell>
                {showdown ? (
                  <Cell>
                    {stats.showdownCardsDrawn} drawn ·{' '}
                    {stats.showdownCardsGuessed} guessed
                  </Cell>
                ) : null}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Cell({
  children,
  strong = false,
}: {
  readonly children: ReactNode
  readonly strong?: boolean
}) {
  return (
    <td
      className={cx(
        'px-2 py-2 text-right font-mono tabular-nums',
        strong && 'font-black',
      )}
    >
      {children}
    </td>
  )
}
