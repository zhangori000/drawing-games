'use client'

import {
  accountIdFromToken,
  MAX_PASSWORD_LENGTH,
  passwordSchema,
  usernameSchema,
} from '@drawing-games/protocol'
import { useId, useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { cx } from '@/components/ui/cx'
import { Modal } from '@/components/ui/modal'
import { useAccount } from '@/lib/account/account-provider'
import { readAccountToken } from '@/lib/account/token-store'

import { useRoomSession } from '../room-session'

type Mode = 'signup' | 'login'

/**
 * `this-match`: the seat played and nothing is saved yet, so linking saves
 * the match just played. `next-matches`: the room would not add this match
 * (the seat did not play it, or it is already saved to another account).
 */
export type LinkPurpose = 'this-match' | 'next-matches'

/**
 * Quick account from the final screen: sign up or log in, then link the
 * account to this seat so the room records history from now on (and, for
 * `this-match`, credits the match just played). The room client confirms
 * the link in a toast; `onLinked` lets the final screen show where the
 * stats went.
 */
export function AccountLinkModal({
  open,
  purpose,
  onClose,
  onLinked,
}: {
  readonly open: boolean
  readonly purpose: LinkPurpose
  readonly onClose: () => void
  readonly onLinked: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        purpose === 'this-match' ? 'Keep your stats' : 'Save your next matches'
      }
      description={
        purpose === 'this-match'
          ? 'A username and password — no email. This match and your word history and stats follow you to every room from now on.'
          : 'A username and password — no email. Your word history and stats follow you to every room from your next match on.'
      }
    >
      {open ? <AccountLinkForm onCancel={onClose} onLinked={onLinked} /> : null}
    </Modal>
  )
}

function AccountLinkForm({
  onCancel,
  onLinked,
}: {
  readonly onCancel: () => void
  readonly onLinked: () => void
}) {
  const account = useAccount()
  const { actions } = useRoomSession()
  const id = useId()
  const [mode, setMode] = useState<Mode>('signup')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    const name = usernameSchema.safeParse(username)
    if (!name.success) {
      setError(`Username: ${name.error.issues[0]?.message ?? 'check it'}`)
      return
    }
    if (mode === 'signup') {
      const pass = passwordSchema.safeParse(password)
      if (!pass.success) {
        setError(`Password: ${pass.error.issues[0]?.message ?? 'check it'}`)
        return
      }
    } else if (!password) {
      setError('Enter your password.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      // A retry after the link failed: this browser is already signed in
      // as this name, so only the link is left to do.
      const signedIn = readAccountToken()
      if (signedIn === null || accountIdFromToken(signedIn) !== name.data) {
        if (mode === 'signup') {
          await account.signup({ username: name.data, password })
        } else {
          await account.login({ username: name.data, password })
        }
      }
      // Signing in already links this seat (the room client follows the
      // browser's sign-in); this waits for that same request.
      const token = readAccountToken()
      if (token) await actions.linkAccount(token)
      onLinked()
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : 'Something went wrong. Try again.',
      )
      setBusy(false)
    }
  }

  const input =
    'min-h-12 w-full rounded-xl border-2 border-[#181713] bg-white px-4 text-base outline-none focus:ring-4 focus:ring-[#5c4cf2]/25'

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <div
        role="group"
        aria-label="Account"
        className="grid grid-cols-2 gap-1 rounded-2xl border-2 border-[#181713] bg-white p-1"
      >
        {(['signup', 'login'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={mode === option}
            onClick={() => {
              setMode(option)
              setError(null)
            }}
            className={cx(
              'min-h-11 rounded-xl text-sm font-black transition',
              mode === option
                ? 'bg-[#181713] text-white'
                : 'text-black/60 hover:bg-black/5',
            )}
          >
            {option === 'signup' ? 'Sign up' : 'Log in'}
          </button>
        ))}
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-user`} className="text-sm font-black">
          Username
        </label>
        <input
          id={`${id}-user`}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={20}
          className={input}
        />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-pass`} className="text-sm font-black">
          Password
        </label>
        <input
          id={`${id}-pass`}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          maxLength={MAX_PASSWORD_LENGTH}
          className={input}
        />
        {mode === 'signup' ? (
          <p className="text-xs text-black/50">
            At least 6 characters. There is no email reset, so keep it safe.
          </p>
        ) : null}
      </div>
      {error ? (
        <p
          role="alert"
          className="rounded-xl border-2 border-[#181713] bg-[#ff6b4a] px-4 py-3 text-sm font-bold text-[#181713]"
        >
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Not now
        </Button>
        <Button type="submit" loading={busy}>
          {mode === 'signup' ? 'Create account' : 'Log in'}
        </Button>
      </div>
    </form>
  )
}
