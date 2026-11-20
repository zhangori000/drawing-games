import type { MatchCreditView, MeView } from '@drawing-games/game-core'
import { expect, test } from 'vitest'

import { finalAccountStatus, playedFinishedMatch } from './account-status'

function me(
  accountId: string | null,
  matchCredit: MatchCreditView | null,
): MeView {
  return {
    memberId: 'm1',
    team: 'A',
    isHost: false,
    role: 'idle',
    accountId,
    matchCredit,
  }
}

test('the final screen says "saved" only when the room saved the match to this account', () => {
  expect(
    finalAccountStatus(me('mina', { played: true, savedTo: 'mina' })),
  ).toEqual({ kind: 'saved', username: 'mina' })
  // A guest who played, nothing saved yet: signing up saves it.
  expect(finalAccountStatus(me(null, { played: true, savedTo: null }))).toEqual(
    {
      kind: 'can-save',
    },
  )
})

test('a seat that joined after the match is offered only its next matches', () => {
  expect(
    finalAccountStatus(me(null, { played: false, savedTo: null })),
  ).toEqual({
    kind: 'next-only',
    username: null,
    played: false,
  })
  expect(
    finalAccountStatus(me('late', { played: false, savedTo: null })),
  ).toEqual({ kind: 'next-only', username: 'late', played: false })
  expect(playedFinishedMatch(me(null, { played: false, savedTo: null }))).toBe(
    false,
  )
})

test('switching accounts after the match was saved names the account that has it', () => {
  expect(
    finalAccountStatus(me('otto', { played: true, savedTo: 'mina' })),
  ).toEqual({ kind: 'saved-elsewhere', savedTo: 'mina', username: 'otto' })
  // Signed out since: still saved to the first account.
  expect(
    finalAccountStatus(me(null, { played: true, savedTo: 'mina' })),
  ).toEqual({ kind: 'saved-elsewhere', savedTo: 'mina', username: null })
})

test('a room that reports no credit falls back to the sign-in', () => {
  expect(finalAccountStatus(me('mina', null))).toEqual({
    kind: 'saved',
    username: 'mina',
  })
  expect(finalAccountStatus(me(null, null))).toEqual({ kind: 'can-save' })
  expect(playedFinishedMatch(me(null, null))).toBe(true)
})
