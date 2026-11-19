'use client'

import type { AccountProfileView } from '@drawing-games/game-core'
import {
  accountIdFromToken,
  type LoginRequest,
  type SignupRequest,
} from '@drawing-games/protocol'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'

import * as api from './api'
import {
  clearAccountToken,
  readAccountToken,
  subscribeAccountToken,
  writeAccountToken,
} from './token-store'

export type AccountStatus = 'loading' | 'guest' | 'signed-in'

export interface AccountContextValue {
  readonly status: AccountStatus
  /** Bearer token for room joins and account calls. Never display it. */
  readonly token: string | null
  /** Normalized username, known from the token even before the profile loads. */
  readonly username: string | null
  readonly profile: AccountProfileView | null
  /** Why the latest profile refresh failed (e.g. offline), if it did. */
  readonly error: string | null
  signup(input: SignupRequest): Promise<AccountProfileView>
  login(input: LoginRequest): Promise<AccountProfileView>
  logout(): Promise<void>
  refresh(): Promise<void>
  updateDisplayName(displayName: string): Promise<AccountProfileView>
}

const AccountContext = createContext<AccountContextValue | null>(null)

const FOCUS_REFRESH_MIN_GAP_MS = 5_000

interface ProfileEntry {
  readonly token: string
  readonly profile: AccountProfileView
}

interface ErrorEntry {
  readonly token: string
  readonly message: string
}

type LoadResult =
  | { readonly kind: 'profile'; readonly profile: AccountProfileView }
  | { readonly kind: 'signed-out' }
  | { readonly kind: 'error'; readonly message: string }

async function fetchProfile(token: string): Promise<LoadResult> {
  try {
    return { kind: 'profile', profile: await api.getMe(token) }
  } catch (error) {
    if (error instanceof api.AccountApiError && error.status === 401) {
      return { kind: 'signed-out' }
    }
    return {
      kind: 'error',
      message:
        error instanceof Error ? error.message : 'Could not load profile.',
    }
  }
}

/** `undefined` until hydrated, so SSR never claims "guest" for a signed-in user. */
function getServerToken(): string | null | undefined {
  return undefined
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const token = useSyncExternalStore(
    subscribeAccountToken,
    readAccountToken,
    getServerToken,
  )
  const [profileEntry, setProfileEntry] = useState<ProfileEntry | null>(null)
  const [errorEntry, setErrorEntry] = useState<ErrorEntry | null>(null)
  const lastRefreshAt = useRef(0)

  const applyLoad = useCallback((currentToken: string, result: LoadResult) => {
    if (result.kind === 'profile') {
      setProfileEntry({ token: currentToken, profile: result.profile })
      setErrorEntry(null)
      return
    }
    if (result.kind === 'signed-out') {
      clearAccountToken()
      setProfileEntry(null)
      setErrorEntry(null)
      return
    }
    setErrorEntry({ token: currentToken, message: result.message })
  }, [])

  const load = useCallback(
    (currentToken: string) => {
      lastRefreshAt.current = Date.now()
      return fetchProfile(currentToken).then((result) =>
        applyLoad(currentToken, result),
      )
    },
    [applyLoad],
  )

  useEffect(() => {
    if (!token) return
    let current = true
    lastRefreshAt.current = Date.now()
    fetchProfile(token).then((result) => {
      if (current) applyLoad(token, result)
    })
    return () => {
      current = false
    }
  }, [token, applyLoad])

  useEffect(() => {
    if (!token) return
    const onFocus = () => {
      if (Date.now() - lastRefreshAt.current < FOCUS_REFRESH_MIN_GAP_MS) return
      void load(token)
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [token, load])

  const handleAuthFailure = useCallback((error: unknown) => {
    if (error instanceof api.AccountApiError && error.status === 401) {
      clearAccountToken()
      setProfileEntry(null)
    }
  }, [])

  const value = useMemo<AccountContextValue>(() => {
    const profile =
      token && profileEntry?.token === token ? profileEntry.profile : null
    const error =
      token && errorEntry?.token === token ? errorEntry.message : null
    const status: AccountStatus =
      token === undefined
        ? 'loading'
        : token === null
          ? 'guest'
          : profile || error
            ? 'signed-in'
            : 'loading'

    const startSession = (session: api.AccountSession) => {
      lastRefreshAt.current = Date.now()
      writeAccountToken(session.token)
      setProfileEntry(session)
      setErrorEntry(null)
      return session.profile
    }

    return {
      status,
      token: token ?? null,
      username: profile?.username ?? (token ? accountIdFromToken(token) : null),
      profile,
      error,
      signup: async (input) => startSession(await api.signup(input)),
      login: async (input) => startSession(await api.login(input)),
      logout: async () => {
        const current = readAccountToken()
        clearAccountToken()
        setProfileEntry(null)
        setErrorEntry(null)
        if (current) await api.logout(current).catch(() => undefined)
      },
      refresh: async () => {
        const current = readAccountToken()
        if (current) await load(current)
      },
      updateDisplayName: async (displayName) => {
        const current = readAccountToken()
        if (!current) {
          throw new api.AccountApiError(
            'UNAUTHORIZED',
            'Sign in to change your name.',
            401,
          )
        }
        try {
          const updated = await api.updateDisplayName(current, displayName)
          setProfileEntry({ token: current, profile: updated })
          return updated
        } catch (error) {
          handleAuthFailure(error)
          throw error
        }
      },
    }
  }, [token, profileEntry, errorEntry, load, handleAuthFailure])

  return <AccountContext value={value}>{children}</AccountContext>
}

export function useAccount(): AccountContextValue {
  const value = useContext(AccountContext)
  if (!value) {
    throw new Error('useAccount must be used inside <AccountProvider>')
  }
  return value
}
