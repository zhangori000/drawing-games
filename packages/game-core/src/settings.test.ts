import { describe, expect, it } from 'vitest'

import { DEFAULT_GAME_SETTINGS } from './settings'

describe('DEFAULT_GAME_SETTINGS', () => {
  it('uses a brisk draft and a six-round default game', () => {
    expect(DEFAULT_GAME_SETTINGS).toMatchObject({
      rounds: 6,
      wordChoiceCount: 3,
      wordDraftSeconds: 15,
      drawingSeconds: 90,
      seenRerollsPerDrawer: 1,
      opponentDraftVisibility: 'options-and-actions',
      surrender: {
        minimumCompletedRounds: 3,
      },
    })
  })

  it('starts with word length hidden and permits a team-majority hint', () => {
    expect(DEFAULT_GAME_SETTINGS.wordLength).toEqual({
      initialVisibility: 'hidden',
      revealPolicy: 'team-majority',
      hintCost: 10,
    })
  })
})
