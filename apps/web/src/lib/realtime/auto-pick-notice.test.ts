import { expect, test } from 'vitest'

import { makeView } from '../testing/fake-socket'
import { autoPickNotice } from './auto-pick-notice'

const ana = { memberId: 'ana', team: 'A', isHost: false, accountId: null }

function view(
  phase: 'word-draft' | 'drawing' | 'round-results',
  options: {
    amDrawer?: boolean
    autoPicked?: boolean
    round?: number
    matchNumber?: number
    memberId?: string
  } = {},
) {
  const amDrawer = options.amDrawer ?? true
  return makeView({
    phase,
    me: {
      ...ana,
      memberId: options.memberId ?? 'ana',
      role: amDrawer ? 'drawer' : 'guesser',
    },
    match: { number: options.matchNumber ?? 1 },
    round: {
      number: options.round ?? 1,
      mine: {
        team: 'A',
        drawerId: amDrawer ? 'ana' : 'ben',
        drawerName: amDrawer ? 'Ana' : 'Ben',
        amDrawer,
        word:
          phase === 'drawing' && amDrawer
            ? {
                wordId: 'everyday/paper-shredder',
                term: 'paper shredder',
                difficulty: 'hard',
                definition: 'A machine that cuts paper into strips.',
                packName: 'Everyday',
                autoPicked: options.autoPicked ?? true,
              }
            : null,
      },
    },
  })
}

test('names the card the room picked when the draft clock ran out', () => {
  expect(autoPickNotice(view('word-draft'), view('drawing'))).toBe(
    'Time’s up! We picked paper shredder (Hard +40) for you.',
  )
})

test('stays quiet when the drawer picked, or for guessers', () => {
  expect(
    autoPickNotice(view('word-draft'), view('drawing', { autoPicked: false })),
  ).toBeNull()
  expect(
    autoPickNotice(
      view('word-draft', { amDrawer: false }),
      view('drawing', { amDrawer: false }),
    ),
  ).toBeNull()
})

test('only fires on the switch from this draft to its drawing', () => {
  // A reload mid-round has no previous view; the banner note covers it.
  expect(autoPickNotice(null, view('drawing'))).toBeNull()
  // Later views of the same round.
  expect(autoPickNotice(view('drawing'), view('drawing'))).toBeNull()
  expect(
    autoPickNotice(
      view('word-draft', { round: 1 }),
      view('drawing', { round: 2 }),
    ),
  ).toBeNull()
  expect(
    autoPickNotice(
      view('word-draft', { matchNumber: 1 }),
      view('drawing', { matchNumber: 2 }),
    ),
  ).toBeNull()
  // A different seat in this tab.
  expect(
    autoPickNotice(view('word-draft', { memberId: 'old' }), view('drawing')),
  ).toBeNull()
})
