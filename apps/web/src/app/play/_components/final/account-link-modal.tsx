'use client'

import {
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
 * Quick account from the final screen: sign up or log in, then link the
 * account to this seat so the room records history from now on.
 */
export function AccountLinkModal({
  open,
  onClose,
}: {
  readonly open: boolean
  readonly onClose: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Keep your stats"
      description="A username and password — no email. Your word history and stats follow you to every room from now on."
    >
      {open ? <AccountLinkForm onDone={onClose} /> : null}
    </Modal>
  )
}

function AccountLinkForm({ onDone }: { readonly onDone: () => void }) {
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
      if (mode === 'signup') {
        await account.signup({ username: name.data, password })
      } else {
        await account.login({ username: name.data, password })
      }
      const token = readAccountToken()
      if (token) await actions.linkAccount(token)
      onDone()
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
          className="rounded-xl border-2 border-[#181713] bg-[#ff6b4a] px-4 py-3 text-sm font-bold text-white"
        >
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onDone} disabled={busy}>
          Not now
        </Button>
        <Button type="submit" loading={busy}>
          {mode === 'signup' ? 'Create account' : 'Log in'}
        </Button>
      </div>
    </form>
  )
}
