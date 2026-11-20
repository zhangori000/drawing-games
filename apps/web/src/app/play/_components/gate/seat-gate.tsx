'use client'

import { TEAM_NAMES, type TeamId } from '@drawing-games/game-core'
import Link from 'next/link'
import { useId, useState, type FormEvent } from 'react'

import { Button, buttonClassName } from '@/components/ui/button'
import { cx } from '@/components/ui/cx'
import { TEAM_COLORS, TEAM_SYMBOLS } from '@/components/ui/team-badge'
import { useAccount } from '@/lib/account/account-provider'
import { getRememberedDisplayName } from '@/lib/identity'
import { isRoomCommandError } from '@/lib/realtime/command-error'
import type {
  RoomActions,
  RoomConnectionStatus,
  SavedSeatSummary,
} from '@/lib/realtime/use-room'

import { StatusScreen } from './status-screen'

const MAX_NAME_LENGTH = 24

export interface SeatGateProps {
  readonly roomCode: string
  readonly status: RoomConnectionStatus
  readonly savedSeat: SavedSeatSummary | null
  readonly actions: RoomActions
}

/**
 * How a browser takes a seat: a tab that already plays here resumes on its
 * own (never reaches this screen); a seat saved by another tab is offered as
 * "Continue as X"; otherwise the join form.
 */
export function SeatGate({
  roomCode,
  status,
  savedSeat,
  actions,
}: SeatGateProps) {
  const [joinAsNew, setJoinAsNew] = useState(false)
  const [full, setFull] = useState(false)

  if (full) {
    return (
      <StatusScreen
        roomCode={roomCode}
        title="This room is full"
        tone="warn"
        actions={
          <>
            <Link href="/" className={buttonClassName('primary', 'md')}>
              Start a new room
            </Link>
            <Button variant="secondary" onClick={() => setFull(false)}>
              Try again
            </Button>
          </>
        }
      >
        Rooms hold 16 players. Ask the host to make space, or start your own
        room.
      </StatusScreen>
    )
  }

  if (savedSeat && !joinAsNew) {
    const resuming = status === 'joining'
    return (
      <StatusScreen
        roomCode={roomCode}
        title="Welcome back"
        actions={
          <>
            <Button
              size="lg"
              loading={resuming}
              onClick={() => actions.resumeSavedSeat()}
            >
              Continue as {savedSeat.displayName || 'your saved player'}
            </Button>
            <Button
              size="lg"
              variant="secondary"
              disabled={resuming}
              onClick={() => setJoinAsNew(true)}
            >
              Join as someone new
            </Button>
          </>
        }
      >
        This browser already has a seat in room{' '}
        <strong className="font-mono">{roomCode}</strong>. Pick it up here, or
        join as another player (handy for testing with two tabs).
      </StatusScreen>
    )
  }

  return (
    <JoinForm
      roomCode={roomCode}
      joining={status === 'joining'}
      actions={actions}
      onFull={() => setFull(true)}
    />
  )
}

type TeamChoice = TeamId | 'any'

function JoinForm({
  roomCode,
  joining,
  actions,
  onFull,
}: {
  readonly roomCode: string
  readonly joining: boolean
  readonly actions: RoomActions
  readonly onFull: () => void
}) {
  const account = useAccount()
  const baseId = useId()
  const [remembered] = useState(getRememberedDisplayName)
  const [name, setName] = useState<string | null>(null)
  const [team, setTeam] = useState<TeamChoice>('any')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const accountName = account.profile?.displayName ?? null
  const value = name ?? (accountName || remembered)
  const busy = submitting || joining

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const displayName = value.trim().replace(/\s+/g, ' ')
    if (!displayName) {
      setError('Type a name so your team knows who you are.')
      return
    }
    if (busy) return
    setSubmitting(true)
    setError(null)
    try {
      await actions.join({
        displayName,
        ...(team === 'any' ? {} : { team }),
      })
    } catch (caught) {
      if (isRoomCommandError(caught) && caught.code === 'ROOM_FULL') {
        onFull()
        return
      }
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : 'Could not join. Try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const next = encodeURIComponent(`/play/${roomCode}`)

  return (
    <StatusScreen roomCode={roomCode} title="Join the room">
      <form onSubmit={submit} noValidate className="grid gap-5">
        <p>
          You&apos;re joining room{' '}
          <strong className="font-mono text-[#181713]">{roomCode}</strong>. Two
          teams, two secret words, one clock.
        </p>

        <div className="grid gap-1.5">
          <label
            htmlFor={`${baseId}-name`}
            className="text-sm font-black text-[#181713]"
          >
            Your name
          </label>
          <input
            id={`${baseId}-name`}
            name="displayName"
            value={value}
            onChange={(event) =>
              setName(event.target.value.slice(0, MAX_NAME_LENGTH))
            }
            maxLength={MAX_NAME_LENGTH}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="go"
            aria-invalid={error ? true : undefined}
            aria-describedby={`${baseId}-name-note`}
            className={cx(
              'min-h-12 w-full rounded-xl border-2 bg-white px-4 text-base text-[#181713] outline-none focus:ring-4 focus:ring-[#5c4cf2]/25',
              error ? 'border-[#c2361b]' : 'border-[#181713]',
            )}
          />
          <p
            id={`${baseId}-name-note`}
            role={error ? 'alert' : undefined}
            className={cx(
              'text-xs leading-5',
              error ? 'font-bold text-[#c2361b]' : 'text-black/50',
            )}
          >
            {error ?? 'Up to 24 characters. Everyone in the room sees it.'}
          </p>
        </div>

        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-black text-[#181713]">
            Team <span className="font-semibold text-black/50">(optional)</span>
          </legend>
          <div className="grid grid-cols-3 gap-2">
            {(['any', 'A', 'B'] as const).map((choice) => (
              <label
                key={choice}
                className={cx(
                  'relative flex min-h-12 cursor-pointer items-center justify-center gap-1.5 rounded-xl border-2 px-2 text-sm font-black transition has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[#5c4cf2]/35',
                  team === choice
                    ? 'border-[#181713] text-white'
                    : 'border-black/15 bg-white text-black/70 hover:border-[#181713]',
                  team === choice && choice === 'any' && 'bg-[#181713]',
                )}
                style={
                  team === choice && choice !== 'any'
                    ? { backgroundColor: TEAM_COLORS[choice] }
                    : undefined
                }
              >
                <input
                  type="radio"
                  name="team"
                  value={choice}
                  checked={team === choice}
                  onChange={() => setTeam(choice)}
                  className="sr-only"
                />
                {choice === 'any' ? (
                  'Either'
                ) : (
                  <>
                    <span aria-hidden="true">{TEAM_SYMBOLS[choice]}</span>
                    {TEAM_NAMES[choice]}
                  </>
                )}
              </label>
            ))}
          </div>
        </fieldset>

        <AccountLine
          loginHref={`/account?mode=login&next=${next}`}
          signupHref={`/account?mode=signup&next=${next}`}
        />

        <Button type="submit" size="lg" block loading={busy}>
          {busy ? 'Joining…' : 'Join room'}
        </Button>
      </form>
    </StatusScreen>
  )
}

function AccountLine({
  loginHref,
  signupHref,
}: {
  readonly loginHref: string
  readonly signupHref: string
}) {
  const account = useAccount()
  if (account.status === 'loading' && !account.username) {
    return <p className="h-6 animate-pulse rounded-lg bg-black/5" aria-hidden />
  }
  if (account.status !== 'guest' && account.username) {
    return (
      <p className="rounded-2xl border-2 border-[#181713] bg-[#f8ff80] px-4 py-3 text-sm font-semibold text-[#181713]">
        Playing as <strong>@{account.username}</strong> — stats will be saved
      </p>
    )
  }
  return (
    // Flex items wrap whole, so on a phone the text takes one line and the
    // two links (44 px tall) share the next instead of splitting a sentence.
    <p className="flex flex-wrap items-center gap-x-1.5 rounded-2xl border-2 border-dashed border-black/25 px-4 py-1 text-sm text-black/65">
      <span className="py-1">Playing as a guest · Save your stats:</span>
      {/* Each link opens the matching tab of /account. */}
      <span className="flex items-center gap-x-1.5">
        <Link href={loginHref} className={ACCOUNT_LINK_CLASS}>
          Log in
        </Link>
        or
        <Link href={signupHref} className={ACCOUNT_LINK_CLASS}>
          sign up
        </Link>
      </span>
    </p>
  )
}

const ACCOUNT_LINK_CLASS =
  'inline-flex min-h-11 items-center align-middle font-bold text-[#5c4cf2] underline underline-offset-4'
