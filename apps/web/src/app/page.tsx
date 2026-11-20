import Link from 'next/link'

import { AccountChip } from '@/components/home/account-chip'
import { HomeActions } from '@/components/home/home-actions'

const improvements = [
  {
    eyebrow: '01 · Fresh words',
    title: 'Every draft is a real choice.',
    body: 'One easy, one medium, one hard card with its bonus on it. A room never brings back a word it has drawn while fresh ones remain, packs rotate, and the game remembers what you have already drawn or seen.',
    color: 'bg-[#f8ff80]',
  },
  {
    eyebrow: '02 · A keyboard that stays put',
    title: 'The drawing never jumps.',
    body: 'An optional compact keyboard on phones means no native keyboard pushing the canvas around, no zoom on focus, and no accidental pinch or double-tap zoom.',
    color: 'bg-[#ffd9cf]',
  },
  {
    eyebrow: '03 · Optional stats',
    title: 'Quick accounts, no email.',
    body: 'A username and password keeps your word history and lifetime stats across rooms and devices, and stops you being offered words you already know.',
    color: 'bg-[#ded9ff]',
  },
] as const

const steps = [
  [
    'Draft',
    'Each drawer secretly picks one of three words. Harder words score more.',
  ],
  [
    'Draw',
    'Both teams draw at the same time. You only get a blurry peek at the other side.',
  ],
  [
    'Guess',
    'Your teammates race the clock. Close guesses get a private “So close!”',
  ],
  ['Showdown', 'Finish with a relay redraw of every word your team picked.'],
] as const

export default function Home() {
  return (
    <main className="min-h-dvh overflow-x-hidden bg-[#f5f0e8] text-[#181713]">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-5 py-5 sm:px-8">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-3 text-sm font-black tracking-[-0.03em]"
        >
          <span
            aria-hidden="true"
            className="grid size-9 rotate-[-5deg] place-items-center rounded-xl bg-[#181713] text-lg text-[#f8ff80] shadow-[3px_3px_0_#ff6b4a]"
          >
            D
          </span>
          <span>drawing.games</span>
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-2">
          <a
            href="#how"
            className="hidden min-h-11 items-center rounded-full px-4 text-sm font-semibold transition hover:bg-black/5 sm:inline-flex"
          >
            How it plays
          </a>
          <AccountChip />
        </nav>
      </header>

      <section className="mx-auto grid w-full max-w-6xl gap-10 px-5 pb-16 pt-6 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pb-24 lg:pt-12">
        <div>
          <p className="mb-5 inline-flex rotate-[-1deg] items-center rounded-full border-2 border-[#181713] bg-[#f8ff80] px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.16em] shadow-[3px_3px_0_#181713]">
            Dual Draw · team draw-and-guess
          </p>
          <h1 className="max-w-2xl text-[clamp(3rem,8vw,6.25rem)] font-black leading-[0.88] tracking-[-0.07em]">
            Two teams.
            <span className="block text-[#ff6b4a]">Two secret words.</span>
            <span className="block text-[#5c4cf2]">One clock.</span>
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-black/65">
            Your team&apos;s drawer and theirs draw at the same time. Guess
            yours first, then keep the pressure on while they scramble.
          </p>
          <div className="mt-8 max-w-xl">
            <HomeActions />
          </div>
        </div>

        <SampleRound />
      </section>

      <section
        aria-labelledby="better-heading"
        className="border-y-2 border-[#181713] bg-white"
      >
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
          <h2
            id="better-heading"
            className="text-3xl font-black tracking-[-0.04em] sm:text-4xl"
          >
            What we fixed
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {improvements.map((item) => (
              <article
                key={item.eyebrow}
                className={`rounded-3xl border-2 border-[#181713] p-6 shadow-[4px_4px_0_#181713] ${item.color}`}
              >
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-black/55">
                  {item.eyebrow}
                </p>
                <h3 className="mt-3 text-2xl font-black tracking-[-0.03em]">
                  {item.title}
                </h3>
                <p className="mt-3 leading-7 text-black/70">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="how"
        aria-labelledby="how-heading"
        className="mx-auto max-w-6xl px-5 py-16 sm:px-8"
      >
        <h2
          id="how-heading"
          className="text-3xl font-black tracking-[-0.04em] sm:text-4xl"
        >
          How it plays
        </h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(([title, body], index) => (
            <li
              key={title}
              className="rounded-3xl border-2 border-[#181713] bg-white/60 p-6"
            >
              <span className="font-mono text-sm font-black text-[#ff6b4a]">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-6 text-2xl font-black tracking-tight">
                {title}
              </h3>
              <p className="mt-2 leading-7 text-black/60">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <footer className="border-t-2 border-[#181713] bg-[#181713] px-5 py-8 text-white sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-4 text-sm sm:flex-row sm:items-center">
          <p className="font-bold">drawing.games · Dual Draw</p>
          <nav
            aria-label="Tools"
            className="flex flex-wrap gap-x-5 gap-y-2 text-white/70"
          >
            <Link
              href="/admin/words"
              className="underline-offset-4 hover:text-white hover:underline"
            >
              Word library
            </Link>
            <Link
              href="/games/dual-draw/lab"
              className="underline-offset-4 hover:text-white hover:underline"
            >
              Canvas lab
            </Link>
            <Link
              href="/me"
              className="underline-offset-4 hover:text-white hover:underline"
            >
              Your stats
            </Link>
          </nav>
        </div>
      </footer>
    </main>
  )
}

function SampleRound() {
  return (
    <div
      aria-hidden="true"
      className="relative mx-auto w-full max-w-xl lg:mx-0"
    >
      <div className="absolute -right-3 -top-4 size-16 rounded-full bg-[#f8ff80] ring-2 ring-[#181713]" />
      <div className="relative rotate-[1.5deg] rounded-[2rem] border-2 border-[#181713] bg-[#181713] p-3 shadow-[10px_12px_0_#5c4cf2]">
        <div className="rounded-[1.4rem] bg-[#fffdf7] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 border-b-2 border-dashed border-black/15 pb-3">
            <div className="flex items-center gap-2 text-sm font-black">
              <span className="rounded-full border-2 border-[#181713] bg-[#ff6b4a] px-3 py-1 text-white">
                ☀ Sun 240
              </span>
              <span className="rounded-full border-2 border-[#181713] bg-[#5c4cf2] px-3 py-1 text-white">
                ☾ Moon 180
              </span>
            </div>
            <span className="grid size-12 place-items-center rounded-full bg-[#ff6b4a] font-mono text-base font-black text-[#181713] ring-2 ring-[#181713]">
              :43
            </span>
          </div>
          <div className="mt-4 aspect-[4/3] overflow-hidden rounded-2xl border-2 border-[#181713] bg-white">
            <svg viewBox="0 0 600 450" className="h-full w-full">
              <rect width="600" height="450" fill="#fff" />
              <path
                d="M150 330h300"
                stroke="#1f9d72"
                strokeWidth="14"
                strokeLinecap="round"
              />
              <path
                d="M250 330V170h100v160"
                fill="none"
                stroke="#181713"
                strokeWidth="12"
                strokeLinejoin="round"
              />
              <path
                d="M235 170l65-60 65 60Z"
                fill="#ff6b4a"
                stroke="#181713"
                strokeWidth="10"
                strokeLinejoin="round"
              />
              <circle
                cx="300"
                cy="215"
                r="18"
                fill="#f8ff80"
                stroke="#181713"
                strokeWidth="8"
              />
              <path
                d="M330 205l150-50M330 225l150 50"
                stroke="#f0b429"
                strokeWidth="10"
                strokeLinecap="round"
              />
              <path
                d="M90 120c25-20 55-20 80 0"
                fill="none"
                stroke="#5c4cf2"
                strokeWidth="8"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
            <div className="rounded-xl border-2 border-black/10 bg-[#f5f0e8] px-4 py-3 text-sm text-black/45">
              lightho…
            </div>
            <div className="grid min-w-20 place-items-center rounded-xl bg-[#5c4cf2] px-4 font-black text-white">
              Guess
            </div>
          </div>
          <p className="mt-2 inline-flex rounded-full bg-[#f8ff80] px-3 py-1 text-sm font-bold">
            “lighthous” — So close!
          </p>
        </div>
      </div>
    </div>
  )
}
