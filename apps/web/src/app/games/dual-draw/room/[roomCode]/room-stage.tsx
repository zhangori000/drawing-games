import type { PlaytestTeamId } from '@/lib/playtest-room-contract'

interface RoomStageProps {
  readonly teamId: PlaytestTeamId
  readonly teamName: string
}

const PIXEL_CELLS = Array.from({ length: 48 }, (_, index) => index)

export function RoomStage({ teamId, teamName }: RoomStageProps) {
  const isTeamA = teamId === 'team-a'

  return (
    <section
      aria-label={`${teamName} drawing stage`}
      data-testid="drawing-stage"
      className="relative min-h-0 bg-[#ded8cc] p-2 sm:p-4"
    >
      <div className="relative h-full min-h-36 overflow-hidden rounded-2xl border-2 border-[#181713] bg-white shadow-[4px_4px_0_#181713]">
        <svg
          viewBox="0 0 800 500"
          className="block size-full"
          role="img"
          aria-label={`${teamName} live drawing`}
          preserveAspectRatio="xMidYMid meet"
        >
          <rect width="800" height="500" fill="#fffdf7" />
          {isTeamA ? (
            <>
              <path
                d="M160 390 305 210l144 180M255 390h244M335 210v-70h77v70M316 145c20-55 99-55 119 0"
                fill="none"
                stroke="#5c4cf2"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="24"
              />
              <path
                d="M372 112c-15-42 17-74 49-82m-9 89c32-29 71-16 86 8"
                fill="none"
                stroke="#ff6b4a"
                strokeLinecap="round"
                strokeWidth="14"
              />
            </>
          ) : (
            <>
              <path
                d="M174 391c56-67 70-210 212-210s169 126 245 210H174Z"
                fill="none"
                stroke="#ff6b4a"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="24"
              />
              <path
                d="M337 179c-24-57 1-114 49-145 4 62 83 74 61 145"
                fill="none"
                stroke="#5c4cf2"
                strokeLinecap="round"
                strokeWidth="16"
              />
            </>
          )}
        </svg>

        <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-[#181713]/85 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white">
          Server-synced playtest
        </div>

        <section
          aria-label="Pixelated opponent drawing preview"
          className="absolute bottom-3 right-3 w-28 overflow-hidden rounded-xl border-2 border-[#181713] bg-[#ded8cc] shadow-[2px_2px_0_#181713] sm:w-36"
        >
          <p className="bg-[#181713] px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-wider text-white">
            Opponent
          </p>
          <div className="grid aspect-video grid-cols-8" aria-hidden="true">
            {PIXEL_CELLS.map((cell) => (
              <span
                key={cell}
                className={
                  cell % 7 === 0
                    ? 'bg-[#5c4cf2]'
                    : cell % 5 === 0
                      ? 'bg-[#ff6b4a]'
                      : cell % 3 === 0
                        ? 'bg-white'
                        : 'bg-[#ded8cc]'
                }
              />
            ))}
          </div>
        </section>
      </div>
    </section>
  )
}
