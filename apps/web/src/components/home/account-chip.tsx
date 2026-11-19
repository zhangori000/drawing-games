'use client'

import Link from 'next/link'

import { useAccount } from '@/lib/account/account-provider'

import { cx } from '../ui/cx'

/** "Sign in" for guests, "@username" (→ /me) once signed in. */
export function AccountChip({ className }: { readonly className?: string }) {
  const account = useAccount()

  if (account.status === 'loading' && !account.username) {
    return (
      <span
        aria-hidden="true"
        className={cx(
          'inline-block h-11 w-24 animate-pulse rounded-full bg-black/10',
          className,
        )}
      />
    )
  }

  const signedIn = account.status !== 'guest' && account.username
  return (
    <Link
      href={signedIn ? '/me' : '/account'}
      className={cx(
        'inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-[#181713] px-4 text-sm font-black transition hover:-translate-y-0.5',
        signedIn ? 'bg-[#f8ff80]' : 'bg-white',
        className,
      )}
    >
      {signedIn ? (
        <>
          <span
            aria-hidden="true"
            className="grid size-6 place-items-center rounded-full bg-[#181713] text-xs text-[#f8ff80]"
          >
            {(account.profile?.displayName ?? account.username ?? '?')
              .slice(0, 1)
              .toUpperCase()}
          </span>
          <span>@{account.username}</span>
        </>
      ) : (
        'Sign in'
      )}
    </Link>
  )
}
