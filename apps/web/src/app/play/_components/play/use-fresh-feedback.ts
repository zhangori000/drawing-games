'use client'

import { useState } from 'react'

import type { GuessFeedback } from '@/lib/realtime/use-room'

import { useRoomSession } from '../room-session'

/**
 * The latest private guess verdict, ignoring anything from before this
 * screen mounted (so last round's "Correct!" never greets a new round).
 */
export function useFreshFeedback(): GuessFeedback | null {
  const { lastFeedback } = useRoomSession()
  const [baselineId] = useState(() => lastFeedback?.id ?? 0)
  return lastFeedback && lastFeedback.id > baselineId ? lastFeedback : null
}
