import { type NextRequest, NextResponse } from 'next/server'

import {
  isPlaytestParticipantId,
  type PlaytestParticipantId,
} from '@/lib/playtest-room-contract'
import {
  getPlaytestRoomView,
  isPlaytestRoomCode,
  resetPlaytestRoom,
  submitPlaytestGuess,
} from '@/lib/playtest-room-store'

export const dynamic = 'force-dynamic'

interface RouteContext {
  readonly params: Promise<{ roomCode: string }>
}

export async function GET(request: NextRequest, context: RouteContext) {
  const roomCode = await readRoomCode(context)
  if (!roomCode) return apiError('Invalid room code', 400)

  const participantId = request.nextUrl.searchParams.get('participant')
  if (!isPlaytestParticipantId(participantId)) {
    return apiError('Unknown playtest participant', 400)
  }

  return noStoreJson(getPlaytestRoomView(roomCode, participantId))
}

export async function POST(request: NextRequest, context: RouteContext) {
  const roomCode = await readRoomCode(context)
  if (!roomCode) return apiError('Invalid room code', 400)

  const body: unknown = await request.json().catch(() => null)
  if (!isRecord(body) || typeof body.action !== 'string') {
    return apiError('Invalid playtest action', 400)
  }

  if (body.action === 'reset') {
    resetPlaytestRoom(roomCode)
    return noStoreJson({ ok: true })
  }

  if (body.action !== 'guess') return apiError('Unknown playtest action', 400)

  const participantId: unknown = body.participantId
  const guess: unknown = body.guess
  if (!isPlaytestParticipantId(participantId) || typeof guess !== 'string') {
    return apiError('A guesser and guess are required', 400)
  }

  try {
    return noStoreJson(
      submitPlaytestGuess(
        roomCode,
        participantId as PlaytestParticipantId,
        guess,
      ),
    )
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'Guess could not be submitted',
      400,
    )
  }
}

async function readRoomCode(context: RouteContext): Promise<string | null> {
  const { roomCode: rawRoomCode } = await context.params
  const roomCode = rawRoomCode.toUpperCase()
  return isPlaytestRoomCode(roomCode) ? roomCode : null
}

function noStoreJson(value: unknown) {
  return NextResponse.json(value, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}

function apiError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    },
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
