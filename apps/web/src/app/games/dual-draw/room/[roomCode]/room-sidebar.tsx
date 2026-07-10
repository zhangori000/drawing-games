import type { PlaytestRoomView } from '@/lib/playtest-room-contract'

interface RoomSidebarProps {
  readonly room: PlaytestRoomView
}

export function RoomSidebar({ room }: RoomSidebarProps) {
  return (
    <aside className="hidden min-h-0 overflow-y-auto border-l-2 border-[#181713] bg-[#fffdf7] p-5 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:block">
      <section aria-labelledby="teams-heading">
        <div className="flex items-center justify-between gap-3">
          <h2
            id="teams-heading"
            className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-black/45"
          >
            Four isolated players
          </h2>
          <span className="font-mono text-[9px] text-black/35">
            sync {room.revision}
          </span>
        </div>

        <div className="mt-3 grid gap-3">
          {room.teams.map((team) => (
            <article
              key={team.id}
              aria-label={team.name}
              className="rounded-2xl border-2 border-[#181713] bg-white p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-black">{team.name}</h3>
                <span className="font-mono text-sm font-black">
                  {team.score}
                </span>
              </div>
              <ul className="mt-2 grid gap-1.5">
                {team.members.map((member) => (
                  <li
                    key={member.id}
                    aria-current={
                      member.id === room.participant.id ? 'true' : undefined
                    }
                    className="flex items-center justify-between rounded-lg bg-[#f5f0e8] px-2.5 py-2 text-xs aria-current:ring-2 aria-current:ring-[#5c4cf2]"
                  >
                    <span className="font-bold">{member.displayName}</span>
                    <span className="flex items-center gap-1.5 text-black/45">
                      <span
                        className="size-1.5 rounded-full bg-[#1f9d72]"
                        aria-hidden="true"
                      />
                      {member.role}
                    </span>
                  </li>
                ))}
              </ul>
              {team.solved && (
                <p className="mt-2 rounded-lg bg-[#f8ff80] px-2.5 py-1.5 text-xs font-bold">
                  Solved this round
                </p>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="mt-6" aria-labelledby="guess-feed-heading">
        <h2
          id="guess-feed-heading"
          className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-black/45"
        >
          Recent guesses
        </h2>
        <ol aria-label="Recent guesses" className="mt-3 grid gap-2">
          {room.recentGuesses.length === 0 ? (
            <li className="rounded-xl border border-dashed border-black/20 p-3 text-xs leading-5 text-black/45">
              No guesses yet. Each browser will see updates here.
            </li>
          ) : (
            room.recentGuesses.map((guess) => (
              <li
                key={guess.id}
                data-result={guess.result}
                className="rounded-xl bg-[#f5f0e8] p-3 text-xs leading-5 data-[result=correct]:bg-[#f8ff80] data-[result=correct]:font-bold"
              >
                {guess.announcement}
              </li>
            ))
          )}
        </ol>
      </section>
    </aside>
  )
}
