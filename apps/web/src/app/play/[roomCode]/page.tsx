import { WORD_PACKS, getPackWordCount } from '@drawing-games/word-bank'
import type { Metadata, Viewport } from 'next'
import { notFound, redirect } from 'next/navigation'

import { GameViewport } from '@/components/layout/game-viewport'
import { gameViewport } from '@/components/layout/game-viewport-meta'
import { normalizeRoomCodeInput } from '@/lib/realtime/rooms-api'

import type { PackInfo } from '../_components/room-session'
import { RoomApp } from '../_components/room-app'

/**
 * The live match screen. Pinned to the visual viewport (no document scroll),
 * content resizes for on-screen keyboards, and notches are respected.
 */
export const viewport: Viewport = {
  ...gameViewport,
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
}

interface PlayPageProps {
  readonly params: Promise<{ roomCode: string }>
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({
  params,
}: PlayPageProps): Promise<Metadata> {
  const { roomCode } = await params
  const code = normalizeRoomCodeInput(roomCode) ?? roomCode
  return {
    title: `Room ${code}`,
    description: 'Dual Draw: two teams draw at the same time. Join the room.',
    robots: { index: false, follow: false },
  }
}

// Word counts are computed here so the browser never loads the word lists.
const PACKS: readonly PackInfo[] = WORD_PACKS.map((pack) => ({
  id: pack.id,
  name: pack.name,
  description: pack.description,
  kidFriendly: pack.kidFriendly,
  wordCount: getPackWordCount(pack.id),
}))

export default async function PlayPage({
  params,
  searchParams,
}: PlayPageProps) {
  const [{ roomCode: rawCode }, query] = await Promise.all([
    params,
    searchParams,
  ])
  const roomCode = normalizeRoomCodeInput(rawCode)
  if (!roomCode) notFound()

  const practice = query.practice === '1'
  if (roomCode !== rawCode) {
    redirect(`/play/${roomCode}${practice ? '?practice=1' : ''}`)
  }

  return (
    <GameViewport>
      <RoomApp roomCode={roomCode} packs={PACKS} practice={practice} />
    </GameViewport>
  )
}
