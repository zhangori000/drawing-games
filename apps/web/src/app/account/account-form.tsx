'use client'

import {
  MAX_PASSWORD_LENGTH,
  accountDisplayNameSchema,
  passwordSchema,
  usernameSchema,
} from '@drawing-games/protocol'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useId, useState, type FormEvent, type ReactNode } from 'react'

import { Button, buttonClassName } from '@/components/ui/button'
import { cx } from '@/components/ui/cx'
import { useAccount } from '@/lib/account/account-provider'

type Mode = 'signup' | 'login'

interface FieldErrors {
  username?: string
  password?: string
  displayName?: string
}

export interface AccountFormProps {
  readonly next: string | null
  readonly initialMode: Mode
}

export function AccountForm({ next, initialMode }: AccountFormProps) {
  const account = useAccount()
  const router = useRouter()
  const baseId = useId()
  const [mode, setMode] = useState<Mode>(initialMode)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const destination = next ?? '/me'

  const validate = (): FieldErrors => {
    const found: FieldErrors = {}
    const usernameError = usernameIssue(username)
    if (usernameError) found.username = usernameError
    if (mode === 'signup') {
      const passwordError = passwordIssue(password)
      if (passwordError) found.password = passwordError
      if (
        displayName.trim() &&
        !accountDisplayNameSchema.safeParse(displayName).success
      ) {
        found.displayName = 'Up to 24 characters'
      }
    } else if (!password) {
      found.password = 'Enter your password'
    }
    return found
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const found = validate()
    setErrors(found)
    setFormError(null)
    if (Object.keys(found).length > 0 || submitting) return

    setSubmitting(true)
    try {
      if (mode === 'signup') {
        await account.signup({
          username,
          password,
          ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
        })
      } else {
        await account.login({ username, password })
      }
      router.replace(destination)
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'Something went wrong. Try again.',
      )
      setSubmitting(false)
    }
  }

  const switchMode = (nextMode: Mode) => {
    setMode(nextMode)
    setErrors({})
    setFormError(null)
  }

  if (account.status === 'signed-in' && !submitting) {
    return (
      <Shell>
        <h1 className="text-4xl font-black tracking-[-0.05em]">
          You&apos;re signed in
        </h1>
        <p className="mt-3 text-black/65">
          Playing as <strong>@{account.username}</strong>. Your word history and
          stats are saved after every match.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={destination} className={buttonClassName('primary', 'md')}>
            {next ? 'Continue' : 'See your stats'}
          </Link>
          <Button variant="secondary" onClick={() => void account.logout()}>
            Sign out
          </Button>
        </div>
      </Shell>
    )
  }

  const tabs: { id: Mode; label: string }[] = [
    { id: 'signup', label: 'Sign up' },
    { id: 'login', label: 'Log in' },
  ]

  return (
    <Shell>
      <h1 className="text-4xl font-black tracking-[-0.05em]">Quick account</h1>
      <p className="mt-3 leading-7 text-black/65">
        No email. Just a username and password so your word history and stats
        follow you.
      </p>

      <div
        role="tablist"
        aria-label="Account"
        className="mt-6 grid grid-cols-2 gap-1 rounded-2xl border-2 border-[#181713] bg-white p-1"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${baseId}-tab-${tab.id}`}
            aria-selected={mode === tab.id}
            aria-controls={`${baseId}-panel`}
            onClick={() => switchMode(tab.id)}
            className={cx(
              'min-h-11 rounded-xl text-sm font-black transition',
              mode === tab.id
                ? 'bg-[#181713] text-white'
                : 'text-black/60 hover:bg-black/5',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <form
        id={`${baseId}-panel`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${mode}`}
        onSubmit={submit}
        noValidate
        className="mt-5 grid gap-4"
      >
        <Field
          id={`${baseId}-username`}
          label="Username"
          hint={
            mode === 'signup'
              ? '3–20 letters, numbers, or underscores'
              : undefined
          }
          error={errors.username}
        >
          <input
            id={`${baseId}-username`}
            name="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            onBlur={() => {
              if (username) {
                setErrors((current) => ({
                  ...current,
                  username: usernameIssue(username),
                }))
              }
            }}
            autoComplete="username"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={20}
            aria-invalid={errors.username ? true : undefined}
            aria-describedby={`${baseId}-username-note`}
            className={inputClass(Boolean(errors.username))}
          />
        </Field>

        <Field
          id={`${baseId}-password`}
          label="Password"
          hint={
            mode === 'signup'
              ? 'At least 6 characters. There is no reset by email, so keep it somewhere safe.'
              : undefined
          }
          error={errors.password}
        >
          <input
            id={`${baseId}-password`}
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={
              mode === 'signup' ? 'new-password' : 'current-password'
            }
            maxLength={MAX_PASSWORD_LENGTH}
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={`${baseId}-password-note`}
            className={inputClass(Boolean(errors.password))}
          />
        </Field>

        {mode === 'signup' ? (
          <Field
            id={`${baseId}-display`}
            label="Display name (optional)"
            hint="What other players see. Defaults to your username."
            error={errors.displayName}
          >
            <input
              id={`${baseId}-display`}
              name="displayName"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              autoComplete="nickname"
              autoCorrect="off"
              spellCheck={false}
              maxLength={24}
              aria-invalid={errors.displayName ? true : undefined}
              aria-describedby={`${baseId}-display-note`}
              className={inputClass(Boolean(errors.displayName))}
            />
          </Field>
        ) : null}

        {formError ? (
          <p
            role="alert"
            className="rounded-xl border-2 border-[#181713] bg-[#ff6b4a] px-4 py-3 text-sm font-bold text-white"
          >
            {formError}
          </p>
        ) : null}

        <Button type="submit" size="lg" block loading={submitting}>
          {mode === 'signup' ? 'Create account' : 'Log in'}
        </Button>
        <p className="text-center text-sm text-black/55">
          {mode === 'signup' ? 'Already have one? ' : 'New here? '}
          <button
            type="button"
            onClick={() => switchMode(mode === 'signup' ? 'login' : 'signup')}
            className="font-bold text-[#5c4cf2] underline underline-offset-4"
          >
            {mode === 'signup' ? 'Log in' : 'Create an account'}
          </button>
        </p>
      </form>
    </Shell>
  )
}

function Shell({ children }: { readonly children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-[#f5f0e8] px-5 py-6 text-[#181713] sm:py-10">
      <div className="mx-auto max-w-md">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-black/60 hover:text-black"
        >
          <span aria-hidden="true">←</span> Back to Dual Draw
        </Link>
        <div className="mt-4 rounded-3xl border-2 border-[#181713] bg-[#fffdf7] p-6 shadow-[6px_6px_0_#181713] sm:p-8">
          {children}
        </div>
      </div>
    </main>
  )
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  readonly id: string
  readonly label: string
  readonly hint?: string
  readonly error?: string
  readonly children: ReactNode
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-black">
        {label}
      </label>
      {children}
      <p
        id={`${id}-note`}
        className={cx(
          'text-xs leading-5',
          error ? 'font-bold text-[#c2361b]' : 'text-black/50',
        )}
      >
        {error ?? hint ?? ' '}
      </p>
    </div>
  )
}

function usernameIssue(value: string): string | undefined {
  const result = usernameSchema.safeParse(value)
  return result.success
    ? undefined
    : (result.error.issues[0]?.message ?? 'Check your username')
}

function passwordIssue(value: string): string | undefined {
  const result = passwordSchema.safeParse(value)
  return result.success
    ? undefined
    : (result.error.issues[0]?.message ?? 'Check your password')
}

function inputClass(invalid: boolean): string {
  return cx(
    'min-h-12 w-full rounded-xl border-2 bg-white px-4 text-base outline-none focus:ring-4 focus:ring-[#5c4cf2]/25',
    invalid ? 'border-[#c2361b]' : 'border-[#181713]',
  )
}
