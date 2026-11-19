import type { AccountProfileView } from '@drawing-games/game-core'
import {
  ACCOUNT_TOKEN_PATTERN,
  loginRequestSchema,
  signupRequestSchema,
  updateProfileRequestSchema,
  type AccountErrorBody,
  type LoginRequest,
  type SignupRequest,
} from '@drawing-games/protocol'

import { isRecord } from '../browser-storage'
import { realtimeHttpUrl } from '../realtime/config'
import { parseProfile } from './profile'

/**
 * Quick-account HTTP client (bearer tokens, no cookies). Requests carry a
 * password only on signup/login and a token only in the Authorization header;
 * neither is ever logged.
 */
export type AccountApiErrorCode =
  | AccountErrorBody['code']
  /** The server could not be reached. */
  | 'NETWORK'
  /** The server has no accounts backend (HTTP 501). */
  | 'UNAVAILABLE'

export class AccountApiError extends Error {
  constructor(
    readonly code: AccountApiErrorCode,
    message: string,
    readonly status: number | null,
  ) {
    super(message)
    this.name = 'AccountApiError'
  }
}

export interface AccountSession {
  readonly token: string
  readonly profile: AccountProfileView
}

export async function signup(input: SignupRequest): Promise<AccountSession> {
  const body = signupRequestSchema.parse(input)
  return readSession(await request('/accounts', { method: 'POST', body }))
}

export async function login(input: LoginRequest): Promise<AccountSession> {
  const body = loginRequestSchema.parse(input)
  return readSession(
    await request('/accounts/session', { method: 'POST', body }),
  )
}

export async function logout(token: string): Promise<void> {
  await request('/accounts/session', { method: 'DELETE', token })
}

export async function getMe(token: string): Promise<AccountProfileView> {
  return readProfile(await request('/accounts/me', { method: 'GET', token }))
}

export async function updateDisplayName(
  token: string,
  displayName: string,
): Promise<AccountProfileView> {
  const body = updateProfileRequestSchema.parse({ displayName })
  const response = await request('/accounts/me', {
    method: 'PATCH',
    body,
    token,
  })
  const profile = parseProfile(
    isRecord(response) && 'profile' in response ? response.profile : response,
  )
  return profile ?? getMe(token)
}

/* -------------------------------------------------------------------------- */

interface RequestOptions {
  readonly method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  readonly body?: unknown
  readonly token?: string
}

async function request(
  path: string,
  options: RequestOptions,
): Promise<unknown> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (options.token) headers.Authorization = `Bearer ${options.token}`

  let response: Response
  try {
    response = await fetch(realtimeHttpUrl(path), {
      method: options.method,
      headers,
      cache: 'no-store',
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch {
    throw new AccountApiError(
      'NETWORK',
      'Can’t reach the account server. Check your connection and try again.',
      null,
    )
  }

  const body: unknown =
    response.status === 204 ? null : await response.json().catch(() => null)
  if (response.ok) return body
  throw toApiError(response.status, body)
}

function toApiError(status: number, body: unknown): AccountApiError {
  if (status === 501) {
    return new AccountApiError(
      'UNAVAILABLE',
      'Accounts aren’t switched on for this server yet. You can still play as a guest.',
      status,
    )
  }
  const code = isRecord(body) ? body.code : undefined
  const message = isRecord(body) ? body.error : undefined
  const knownCode = isErrorCode(code) ? code : fallbackCode(status)
  return new AccountApiError(
    knownCode,
    typeof message === 'string' && message.length > 0
      ? message
      : fallbackMessage(knownCode),
    status,
  )
}

const ERROR_CODES: readonly AccountErrorBody['code'][] = [
  'INVALID_INPUT',
  'USERNAME_TAKEN',
  'INVALID_CREDENTIALS',
  'RATE_LIMITED',
  'UNAUTHORIZED',
  'NOT_FOUND',
  'INTERNAL',
]

function isErrorCode(value: unknown): value is AccountErrorBody['code'] {
  return ERROR_CODES.some((code) => code === value)
}

function fallbackCode(status: number): AccountErrorBody['code'] {
  if (status === 400) return 'INVALID_INPUT'
  if (status === 401) return 'UNAUTHORIZED'
  if (status === 404) return 'NOT_FOUND'
  if (status === 409) return 'USERNAME_TAKEN'
  if (status === 429) return 'RATE_LIMITED'
  return 'INTERNAL'
}

function fallbackMessage(code: AccountErrorBody['code']): string {
  switch (code) {
    case 'INVALID_INPUT':
      return 'Check the username and password and try again.'
    case 'USERNAME_TAKEN':
      return 'That username is taken. Try another one.'
    case 'INVALID_CREDENTIALS':
      return 'That username and password don’t match.'
    case 'RATE_LIMITED':
      return 'Too many attempts. Wait a few minutes and try again.'
    case 'UNAUTHORIZED':
      return 'You’ve been signed out. Sign in again.'
    case 'NOT_FOUND':
      return 'That account doesn’t exist.'
    case 'INTERNAL':
      return 'The account server had a problem. Try again in a moment.'
  }
}

async function readSession(body: unknown): Promise<AccountSession> {
  const token = isRecord(body) ? body.token : undefined
  if (typeof token !== 'string' || !ACCOUNT_TOKEN_PATTERN.test(token)) {
    throw new AccountApiError(
      'INTERNAL',
      'The account server sent an unexpected response.',
      null,
    )
  }
  const profile = isRecord(body) ? parseProfile(body.profile) : null
  return { token, profile: profile ?? (await getMe(token)) }
}

function readProfile(body: unknown): AccountProfileView {
  const profile = parseProfile(body)
  if (!profile) {
    throw new AccountApiError(
      'INTERNAL',
      'The account server sent an unexpected response.',
      null,
    )
  }
  return profile
}
