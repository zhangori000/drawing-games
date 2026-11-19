import { notFound, permanentRedirect } from 'next/navigation'

import { normalizeRoomCodeInput } from '@/lib/realtime/rooms-api'

interface LegacyRoomPageProps {
  readonly params: Promise<{ roomCode: string }>
}

/** Old playtest room URLs now open the live match screen. */
export default async function LegacyRoomPage({ params }: LegacyRoomPageProps) {
  const { roomCode } = await params
  const code = normalizeRoomCodeInput(roomCode)
  if (!code) notFound()
  permanentRedirect(`/play/${code}`)
}
