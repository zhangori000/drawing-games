import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import {
  isPlaytestParticipantId,
  type PlaytestParticipantId,
} from '@/lib/playtest-room-contract'

import { RoomClient } from './room-client'

export const metadata: Metadata = {
  title: 'Dual Draw multiplayer playtest',
  description:
    'A four-participant room surface for checking role privacy, room sync, and keyboard-stable guessing.',
}

interface RoomPageProps {
  readonly params: Promise<{ roomCode: string }>
  readonly searchParams: Promise<{ participant?: string | string[] }>
}

export default async function DualDrawRoomPage({
  params,
  searchParams,
}: RoomPageProps) {
  const [{ roomCode: rawRoomCode }, query] = await Promise.all([
    params,
    searchParams,
  ])
  const roomCode = rawRoomCode.toUpperCase()
  if (!/^[A-Z0-9]{4,8}$/.test(roomCode)) notFound()

  const requestedParticipant = Array.isArray(query.participant)
    ? query.participant[0]
    : query.participant
  const participantId: PlaytestParticipantId = isPlaytestParticipantId(
    requestedParticipant,
  )
    ? requestedParticipant
    : 'team-a-guesser'

  return <RoomClient roomCode={roomCode} participantId={participantId} />
}
