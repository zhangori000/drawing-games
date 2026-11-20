import type { Metadata } from 'next'

import { safeNextPath } from '@/lib/account/safe-next-path'

import { AccountForm } from './account-form'

export const metadata: Metadata = {
  title: 'Quick account',
  description:
    'Sign up or log in with just a username and password to keep your Dual Draw word history and stats.',
}

interface AccountPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const params = await searchParams
  const mode = params.mode === 'login' ? 'login' : 'signup'
  return <AccountForm next={safeNextPath(params.next)} initialMode={mode} />
}
