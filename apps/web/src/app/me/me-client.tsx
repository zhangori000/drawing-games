'use client'

import Link from 'next/link'
import { useSyncExternalStore, type ReactNode } from 'react'

import { Button, buttonClassName } from '@/components/ui/button'
import { useAccount } from '@/lib/account/account-provider'
import { lifetimeStatCards } from '@/lib/account/stats'
import { countRememberedWords } from '@/lib/word-history'

import { ProfileHeader } from './profile-header'
import { RecentMatches } from './recent-matches'
import { RecentWords } from './recent-words'

export function MeClient() {
  const account = useAccount()

  if (account.status === 'loading') {
    return (
      <Page>
        <div
          aria-busy="true"
          aria-label="Loading your profile"
          className="grid gap-4"
        >
          <div className="h-28 animate-pulse rounded-3xl bg-black/10" />
          <div className="h-48 animate-pulse rounded-3xl bg-black/5" />
        </div>
      </Page>
    )
  }

  if (account.status === 'guest') return <GuestCallToAction />

  const profile = account.profile
  if (!profile) {
    return (
      <Page>
        <section className="rounded-3xl border-2 border-[#181713] bg-white p-6 shadow-[4px_4px_0_#181713]">
          <h1 className="text-3xl font-black tracking-[-0.04em]">
            @{account.username}
          </h1>
          <p role="alert" className="mt-3 text-black/65">
            {account.error ?? 'Your profile could not be loaded.'}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button onClick={() => void account.refresh()}>Try again</Button>
            <Button variant="secondary" onClick={() => void account.logout()}>
              Sign out
            </Button>
          </div>
        </section>
      </Page>
    )
  }

  return (
    <Page>
      <ProfileHeader profile={profile} />

      <section aria-labelledby="stats-heading" className="mt-10">
        <h2
          id="stats-heading"
          className="text-2xl font-black tracking-[-0.03em]"
        >
          Lifetime stats
        </h2>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {lifetimeStatCards(profile.stats).map((card) => (
            <div
              key={card.id}
              className="rounded-2xl border-2 border-[#181713] bg-white p-4"
            >
              <dt className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-black/50">
                {card.label}
              </dt>
              <dd className="mt-2 text-3xl font-black tabular-nums tracking-[-0.04em]">
                {card.value}
              </dd>
              <dd className="mt-1 text-xs text-black/50">{card.detail}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-8 flex flex-wrap items-center gap-4 rounded-3xl border-2 border-[#181713] bg-[#f8ff80] p-5 shadow-[4px_4px_0_#181713]">
        <p className="text-5xl font-black tabular-nums tracking-[-0.05em]">
          {profile.avoidedWordCount}
        </p>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-black">
            Words you will never be offered again: {profile.avoidedWordCount}
          </p>
          <p className="text-sm text-black/60">
            Words you drew or marked “seen it” stay out of your drafts for good.
          </p>
        </div>
      </section>

      <RecentWords words={profile.recentWords} />
      <RecentMatches matches={profile.recentMatches} />

      <div className="mt-12 flex flex-wrap gap-3 border-t-2 border-dashed border-black/15 pt-6">
        <Link href="/" className={buttonClassName('primary', 'md')}>
          Play a match
        </Link>
        <Button variant="secondary" onClick={() => void account.logout()}>
          Sign out
        </Button>
      </div>
    </Page>
  )
}

function GuestCallToAction() {
  const localWords = useSyncExternalStore(
    subscribeToStorage,
    countLocalWords,
    zero,
  )
  return (
    <Page>
      <section className="rounded-3xl border-2 border-[#181713] bg-[#fffdf7] p-6 shadow-[6px_6px_0_#181713] sm:p-8">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[#5c4cf2]">
          Guest
        </p>
        <h1 className="mt-2 text-4xl font-black tracking-[-0.05em]">
          Keep your words and stats
        </h1>
        <p className="mt-3 max-w-lg leading-7 text-black/65">
          A quick account (username and password, no email) keeps your lifetime
          stats and stops you being offered words you have already drawn, on any
          device.
        </p>
        {localWords > 0 ? (
          <p className="mt-3 text-sm text-black/55">
            This browser remembers {localWords} recent{' '}
            {localWords === 1 ? 'word' : 'words'} for you as a guest.
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/account?next=/me"
            className={buttonClassName('primary', 'lg')}
          >
            Create a quick account
          </Link>
          <Link
            href="/account?mode=login&next=/me"
            className={buttonClassName('secondary', 'lg')}
          >
            Log in
          </Link>
        </div>
      </section>
    </Page>
  )
}

function Page({ children }: { readonly children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-[#f5f0e8] px-5 py-6 text-[#181713] sm:px-8 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-black/60 hover:text-black"
        >
          <span aria-hidden="true">←</span> Back to Dual Draw
        </Link>
        <div className="mt-4">{children}</div>
      </div>
    </main>
  )
}

function subscribeToStorage(onChange: () => void): () => void {
  window.addEventListener('storage', onChange)
  return () => window.removeEventListener('storage', onChange)
}

function countLocalWords(): number {
  return countRememberedWords()
}

function zero(): number {
  return 0
}
