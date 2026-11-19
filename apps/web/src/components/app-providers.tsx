'use client'

import type { ReactNode } from 'react'

import { AccountProvider } from '@/lib/account/account-provider'

/** Client-side providers mounted once by the root layout. */
export function AppProviders({ children }: { children: ReactNode }) {
  return <AccountProvider>{children}</AccountProvider>
}
