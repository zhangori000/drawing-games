'use client'

import { useRouter } from 'next/navigation'
import { useId, useState, type FormEvent } from 'react'

import {
  createRoom,
  formatRoomCodeInput,
  getRoomInfo,
  normalizeRoomCodeInput,
} from '@/lib/realtime/rooms-api'

import { Button } from '../ui/button'

type Busy = 'create' | 'practice' | 'join' | null

/** Create a room, join one by code, or start a solo practice match. */
export function HomeActions() {
  const router = useRouter()
  const codeId = useId()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<{
    for: 'create' | 'join'
    message: string
  } | null>(null)

  const start = async (kind: 'create' | 'practice') => {
    if (busy) return
    setBusy(kind)
    setError(null)
    try {
      const roomCode = await createRoom()
      router.push(
        kind === 'practice'
          ? `/play/${roomCode}?practice=1`
          : `/play/${roomCode}`,
      )
    } catch (caught) {
      setError({ for: 'create', message: messageOf(caught) })
      setBusy(null)
    }
  }

  const join = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    const roomCode = normalizeRoomCodeInput(code)
    if (!roomCode) {
      setError({
        for: 'join',
        message: 'Room codes are 4–8 letters and numbers.',
      })
      return
    }
    setBusy('join')
    setError(null)
    try {
      const info = await getRoomInfo(roomCode)
      if (!info.exists) {
        setError({
          for: 'join',
          message: `Room not found. Check the code “${roomCode}” and try again.`,
        })
        setBusy(null)
        return
      }
      router.push(`/play/${roomCode}`)
    } catch (caught) {
      setError({ for: 'join', message: messageOf(caught) })
      setBusy(null)
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          size="lg"
          loading={busy === 'create'}
          disabled={busy !== null && busy !== 'create'}
          onClick={() => void start('create')}
        >
          Create a room
        </Button>
        <Button
          size="lg"
          variant="lime"
          loading={busy === 'practice'}
          disabled={busy !== null && busy !== 'practice'}
          onClick={() => void start('practice')}
        >
          Practice with bots
        </Button>
      </div>
      {error?.for === 'create' ? (
        <p role="alert" className="text-sm font-semibold text-[#c2361b]">
          {error.message}
        </p>
      ) : null}

      <form
        onSubmit={join}
        className="rounded-2xl border-2 border-[#181713] bg-white p-3 shadow-[4px_4px_0_#181713]"
        noValidate
      >
        <label
          htmlFor={codeId}
          className="block px-1 pb-2 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-black/55"
        >
          Join with a code
        </label>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <input
            id={codeId}
            value={code}
            onChange={(event) => {
              setCode(formatRoomCodeInput(event.target.value))
              if (error?.for === 'join') setError(null)
            }}
            placeholder="ABCDE"
            inputMode="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            enterKeyHint="go"
            maxLength={10}
            aria-invalid={error?.for === 'join' || undefined}
            aria-describedby={
              error?.for === 'join' ? `${codeId}-error` : undefined
            }
            className="min-h-12 min-w-0 rounded-xl border-2 border-[#181713] bg-[#f5f0e8] px-4 font-mono text-base font-black uppercase tracking-[0.3em] outline-none placeholder:tracking-[0.3em] placeholder:text-black/25 focus:ring-4 focus:ring-[#5c4cf2]/25"
          />
          <Button
            type="submit"
            variant="dark"
            loading={busy === 'join'}
            disabled={busy !== null && busy !== 'join'}
          >
            Join
          </Button>
        </div>
        {error?.for === 'join' ? (
          <p
            id={`${codeId}-error`}
            role="alert"
            className="px-1 pt-2 text-sm font-semibold text-[#c2361b]"
          >
            {error.message}
          </p>
        ) : null}
      </form>
    </div>
  )
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Something went wrong. Try again.'
}
