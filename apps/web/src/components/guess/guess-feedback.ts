import type { GuessVerdict } from '@drawing-games/game-core'

export interface GuessDockFeedback {
  /** Changes per server verdict so a repeated verdict still re-announces. */
  readonly id: number
  readonly text: string
  readonly verdict: GuessVerdict
}

export type FeedbackTone = 'correct' | 'warm' | 'neutral' | 'error'

/** The private one-liner the guesser sees after each guess. */
export function describeFeedback(feedback: GuessDockFeedback): {
  readonly message: string
  readonly tone: FeedbackTone
} {
  const quoted = `“${feedback.text}”`
  switch (feedback.verdict) {
    case 'correct':
      return { message: 'Correct! Your team got it.', tone: 'correct' }
    case 'close':
      return { message: `${quoted} — So close!`, tone: 'warm' }
    case 'partial':
      return { message: `${quoted} — One word is right!`, tone: 'warm' }
    case 'wrong':
      return { message: `${quoted} isn’t it. Keep going.`, tone: 'neutral' }
  }
}
