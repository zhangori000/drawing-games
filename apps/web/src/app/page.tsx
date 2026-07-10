import Link from 'next/link'

const promises = [
  {
    eyebrow: 'Stay in the room',
    title: 'Refreshes are recoverable.',
    body: 'A browser tab can vanish. Your player identity and the live match should not vanish with it.',
  },
  {
    eyebrow: 'Draw at hand speed',
    title: 'Local ink, ordered online.',
    body: 'Your stroke appears immediately, then travels as small batched vector operations to everyone else.',
  },
  {
    eyebrow: 'Compete without nonsense',
    title: 'Points explain themselves.',
    body: 'Time, word difficulty, hints, and a bounded shutdown bounty all have visible jobs.',
  },
]

export default function Home() {
  return (
    <main className="min-h-dvh overflow-hidden bg-[#f5f0e8] text-[#181713]">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
        <Link
          href="/"
          className="inline-flex items-center gap-3 text-sm font-black tracking-[-0.03em]"
        >
          <span className="grid size-9 rotate-[-5deg] place-items-center rounded-xl bg-[#181713] text-lg text-[#f8ff80] shadow-[3px_3px_0_#ff6b4a]">
            D
          </span>
          <span>drawing.games</span>
          <span className="rounded-full border border-black/15 px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-black/55">
            foundation
          </span>
        </Link>

        <nav
          className="flex items-center gap-2"
          aria-label="Primary navigation"
        >
          <a
            href="#dual-draw"
            className="hidden rounded-full px-4 py-2 text-sm font-semibold transition hover:bg-black/5 sm:block"
          >
            First game
          </a>
          <Link
            href="/games/dual-draw/room/PLAY1?participant=team-a-guesser"
            className="rounded-full bg-[#181713] px-4 py-2 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-black"
          >
            Room playtest
          </Link>
        </nav>
      </header>

      <section className="mx-auto grid w-full max-w-7xl gap-12 px-5 pb-20 pt-10 sm:px-8 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:px-12 lg:pb-28 lg:pt-20">
        <div>
          <p className="mb-5 inline-flex rotate-[-1deg] items-center rounded-full border-2 border-[#181713] bg-[#f8ff80] px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.16em] shadow-[3px_3px_0_#181713]">
            Built for the friend who always gets disconnected
          </p>
          <h1 className="max-w-3xl text-[clamp(3.6rem,9vw,7.5rem)] font-black leading-[0.84] tracking-[-0.075em]">
            Drawing games,
            <span className="relative mt-3 block w-fit text-[#5c4cf2]">
              without the rage.
              <svg
                viewBox="0 0 560 24"
                className="absolute -bottom-5 left-0 h-6 w-full text-[#ff6b4a]"
                aria-hidden="true"
              >
                <path
                  d="M4 14C93 3 151 21 238 11s155-1 318 2"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="8"
                />
              </svg>
            </span>
          </h1>

          <p className="mt-12 max-w-xl text-lg leading-8 text-black/65 sm:text-xl">
            One home for quick, competitive drawing games. Fast ink, real
            scoring, object erase, undo/redo, and a route back into the match
            after Safari wakes up confused.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/games/dual-draw/room/PLAY1?participant=team-a-guesser"
              className="inline-flex min-h-13 items-center justify-center rounded-2xl bg-[#5c4cf2] px-6 py-3.5 text-base font-bold text-white shadow-[4px_4px_0_#181713] transition hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#181713]"
            >
              Open a playtest room
            </Link>
            <Link
              href="/games/dual-draw/lab"
              className="inline-flex min-h-13 items-center justify-center rounded-2xl border-2 border-[#181713] bg-white/65 px-6 py-3.5 text-base font-bold transition hover:bg-white"
            >
              Try the local canvas
            </Link>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-2xl lg:mx-0">
          <div className="absolute -left-5 top-16 hidden size-28 rotate-12 rounded-[2rem] bg-[#ff6b4a] lg:block" />
          <div className="absolute -right-4 -top-5 size-20 rounded-full bg-[#f8ff80] ring-2 ring-[#181713]" />

          <div className="relative rotate-[1.5deg] rounded-[2rem] border-2 border-[#181713] bg-[#181713] p-3 shadow-[10px_12px_0_#5c4cf2]">
            <div className="rounded-[1.4rem] bg-[#fffdf7] p-4 sm:p-6">
              <div className="flex items-center justify-between gap-4 border-b-2 border-dashed border-black/15 pb-4">
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-black/45">
                    Live round · 04/06
                  </p>
                  <p className="mt-1 text-xl font-black tracking-tight">
                    Team Sun vs Team Moon
                  </p>
                </div>
                <div className="grid size-14 place-items-center rounded-full bg-[#ff6b4a] font-mono text-lg font-black text-white ring-2 ring-[#181713]">
                  :43
                </div>
              </div>

              <div className="mt-5 aspect-[4/3] overflow-hidden rounded-2xl border-2 border-[#181713] bg-white">
                <svg
                  viewBox="0 0 600 450"
                  className="h-full w-full"
                  role="img"
                  aria-label="A playful sample drawing"
                >
                  <rect width="600" height="450" fill="#fff" />
                  <path
                    d="M90 326c58-76 74-193 170-171 80 18 55 102 114 119 55 16 65-94 132-70"
                    fill="none"
                    stroke="#5c4cf2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="22"
                  />
                  <path
                    d="M153 162c13-46 72-72 116-42m95 165c39 14 71 55 70 99"
                    fill="none"
                    stroke="#ff6b4a"
                    strokeLinecap="round"
                    strokeWidth="13"
                  />
                  <circle cx="239" cy="213" r="12" fill="#181713" />
                  <circle cx="303" cy="211" r="12" fill="#181713" />
                  <path
                    d="M244 255c22 18 43 17 65-2"
                    fill="none"
                    stroke="#181713"
                    strokeLinecap="round"
                    strokeWidth="8"
                  />
                  <path
                    d="m92 112 14 26 29 4-21 20 5 29-27-14-26 14 5-29-21-20 29-4Z"
                    fill="#f8ff80"
                    stroke="#181713"
                    strokeLinejoin="round"
                    strokeWidth="5"
                  />
                </svg>
              </div>

              <div className="mt-4 grid grid-cols-[1fr_auto] gap-3">
                <div className="rounded-xl border-2 border-black/10 bg-[#f5f0e8] px-4 py-3 text-sm text-black/45">
                  Type a guess without losing the canvas…
                </div>
                <div className="grid min-w-24 place-items-center rounded-xl bg-[#181713] px-4 font-bold text-white">
                  Guess
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y-2 border-[#181713] bg-[#f8ff80]">
        <div className="mx-auto grid max-w-7xl divide-y-2 divide-[#181713] lg:grid-cols-3 lg:divide-x-2 lg:divide-y-0">
          {promises.map((promise) => (
            <article key={promise.eyebrow} className="px-6 py-10 sm:px-9">
              <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-black/55">
                {promise.eyebrow}
              </p>
              <h2 className="mt-3 text-2xl font-black tracking-[-0.035em]">
                {promise.title}
              </h2>
              <p className="mt-3 max-w-md leading-7 text-black/65">
                {promise.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section
        id="dual-draw"
        className="mx-auto grid w-full max-w-7xl gap-12 px-5 py-24 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:px-12"
      >
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-[#5c4cf2]">
            Game 01
          </p>
          <h2 className="mt-3 text-5xl font-black tracking-[-0.06em] sm:text-6xl">
            Dual Draw
          </h2>
          <p className="mt-5 max-w-md text-lg leading-8 text-black/60">
            Two teams draw different words at the same time. Each drawer races
            to make their team understand first—without sacrificing the chance
            to finish.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {[
            [
              '01',
              'Draft',
              'Choose from 3 words in 15 seconds. Harder words are worth more.',
            ],
            [
              '02',
              'Draw',
              'Vector strokes make object erase, undo, redo, and reconnect possible.',
            ],
            [
              '03',
              'Guess',
              'The canvas stays planted when the phone keyboard opens or a guess is sent.',
            ],
            [
              '04',
              'Showdown',
              'Redraw the match history in a final round-robin relay.',
            ],
          ].map(([number, title, body]) => (
            <article
              key={number}
              className="rounded-3xl border-2 border-[#181713] bg-white/55 p-6 transition hover:-translate-y-1 hover:bg-white"
            >
              <span className="font-mono text-sm font-black text-[#ff6b4a]">
                {number}
              </span>
              <h3 className="mt-8 text-2xl font-black tracking-tight">
                {title}
              </h3>
              <p className="mt-2 leading-7 text-black/60">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="border-t-2 border-[#181713] bg-[#181713] px-5 py-8 text-white sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-3 text-sm sm:flex-row">
          <p className="font-bold">drawing.games · foundation build</p>
          <p className="text-white/55">
            Rules first. Sockets second. Hype later.
          </p>
        </div>
      </footer>
    </main>
  )
}
