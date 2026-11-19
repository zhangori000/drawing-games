'use client'

import type { AccountProfileView } from '@drawing-games/game-core'
import { accountDisplayNameSchema } from '@drawing-games/protocol'
import { useId, useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { useAccount } from '@/lib/account/account-provider'

export function ProfileHeader({
  profile,
}: {
  readonly profile: AccountProfileView
}) {
  const account = useAccount()
  const inputId = useId()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(profile.displayName)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsed = accountDisplayNameSchema.safeParse(name)
    if (!parsed.success) {
      setError('Use 1–24 characters.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await account.updateDisplayName(parsed.data)
      setEditing(false)
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not save your name.',
      )
    } finally {
      setSaving(false)
    }
  }

  const memberSince =
    profile.createdAtMs > 0
      ? new Date(profile.createdAtMs).toLocaleDateString(undefined, {
          month: 'long',
          year: 'numeric',
        })
      : null

  return (
    <section className="flex flex-wrap items-center gap-5 rounded-3xl border-2 border-[#181713] bg-[#fffdf7] p-5 shadow-[6px_6px_0_#181713] sm:p-6">
      <span
        aria-hidden="true"
        className="grid size-16 shrink-0 rotate-[-4deg] place-items-center rounded-2xl bg-[#181713] text-3xl font-black text-[#f8ff80] shadow-[3px_3px_0_#ff6b4a]"
      >
        {profile.displayName.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        {editing ? (
          <form onSubmit={save} className="flex flex-wrap items-start gap-2">
            <label htmlFor={inputId} className="sr-only">
              Display name
            </label>
            <input
              id={inputId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={24}
              autoComplete="nickname"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${inputId}-error` : undefined}
              className="min-h-12 min-w-0 flex-1 rounded-xl border-2 border-[#181713] bg-white px-4 text-base font-bold outline-none focus:ring-4 focus:ring-[#5c4cf2]/25"
            />
            <Button type="submit" loading={saving}>
              Save
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setEditing(false)
                setName(profile.displayName)
                setError(null)
              }}
            >
              Cancel
            </Button>
            {error ? (
              <p
                id={`${inputId}-error`}
                role="alert"
                className="w-full text-sm font-bold text-[#c2361b]"
              >
                {error}
              </p>
            ) : null}
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate text-3xl font-black tracking-[-0.04em] sm:text-4xl">
              {profile.displayName}
            </h1>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setName(profile.displayName)
                setEditing(true)
              }}
            >
              Edit name
            </Button>
          </div>
        )}
        <p className="mt-1 font-mono text-sm text-black/55">
          @{profile.username}
          {memberSince ? ` · playing since ${memberSince}` : ''}
        </p>
      </div>
    </section>
  )
}
