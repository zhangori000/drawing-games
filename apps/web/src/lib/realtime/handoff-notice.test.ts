import { expect, test } from 'vitest'

import { makeView } from '../testing/fake-socket'
import { drawerHandoffNotice } from './handoff-notice'

const ben = { memberId: 'ben', team: 'A', isHost: false, accountId: null }
const match = { number: 1 }
const member = (id: string, connected = true) => ({
  id,
  displayName: id,
  team: 'A',
  kind: 'human',
  connected,
  ready: true,
  isHost: false,
  isDrawer: false,
  hasAccount: false,
})

function roundView(
  phase: 'word-draft' | 'drawing' | 'round-results',
  drawer: { id: string; name: string },
  options: {
    round?: number
    members?: unknown[]
    matchNumber?: number
  } = {},
) {
  return makeView({
    phase,
    me: { ...ben, role: drawer.id === 'ben' ? 'drawer' : 'guesser' },
    match: { number: options.matchNumber ?? 1 },
    members: options.members ?? [member('max'), member('ben')],
    round: {
      number: options.round ?? 1,
      mine: {
        team: 'A',
        drawerId: drawer.id,
        drawerName: drawer.name,
        amDrawer: drawer.id === 'ben',
      },
    },
  })
}

const max = { id: 'max', name: 'Max' }
const benDraws = { id: 'ben', name: 'Ben' }

test('the drawer leaving mid-draft hands the pick over with a notice', () => {
  expect(
    drawerHandoffNotice(
      roundView('word-draft', max),
      roundView('word-draft', benDraws, { members: [member('ben')] }),
    ),
  ).toBe('Max left the room. You’re picking your team’s word now.')
})

test('a drawer who lost connection mid-drawing is named as such', () => {
  expect(
    drawerHandoffNotice(
      roundView('drawing', max),
      roundView('drawing', benDraws, {
        members: [member('max', false), member('ben')],
      }),
    ),
  ).toBe('Max lost connection. You’re drawing now: same word, same canvas.')
})

test('a handoff at the draft deadline still reads as drawing', () => {
  expect(
    drawerHandoffNotice(
      roundView('word-draft', max),
      roundView('drawing', benDraws, { members: [member('ben')] }),
    ),
  ).toBe('Max left the room. You’re drawing now: same word, same canvas.')
})

test('the normal rotation between rounds and matches is not a handoff', () => {
  // Next round: Ben's regular turn.
  expect(
    drawerHandoffNotice(
      roundView('round-results', max),
      roundView('word-draft', benDraws, { round: 2 }),
    ),
  ).toBeNull()
  expect(
    drawerHandoffNotice(
      roundView('drawing', max, { round: 1 }),
      roundView('word-draft', benDraws, { round: 2 }),
    ),
  ).toBeNull()
  // A rematch starts over at round 1.
  expect(
    drawerHandoffNotice(
      roundView('drawing', max, { matchNumber: 1 }),
      roundView('word-draft', benDraws, { matchNumber: 2 }),
    ),
  ).toBeNull()
  // Nothing changed, or no earlier view (first load / reconnect).
  expect(
    drawerHandoffNotice(roundView('drawing', max), roundView('drawing', max)),
  ).toBeNull()
  expect(drawerHandoffNotice(null, roundView('drawing', benDraws))).toBeNull()
})

function showdownView(
  cardIndex: number,
  drawer: { id: string; name: string },
  members: unknown[] = [member('max'), member('ben')],
) {
  return makeView({
    phase: 'showdown',
    me: { ...ben, role: drawer.id === 'ben' ? 'drawer' : 'guesser' },
    match,
    members,
    showdown: {
      mine: {
        team: 'A',
        cardIndex,
        cardCount: 3,
        drawerId: drawer.id,
        drawerName: drawer.name,
        amDrawer: drawer.id === 'ben',
        finished: false,
      },
    },
  })
}

test('a showdown card changes hands only on a handoff, not on the next card', () => {
  expect(
    drawerHandoffNotice(
      showdownView(1, max),
      showdownView(1, benDraws, [member('ben')]),
    ),
  ).toBe('Max left the room. You’re drawing this card now.')
  // The relay passing the next card to Ben is the normal rotation.
  expect(
    drawerHandoffNotice(showdownView(1, max), showdownView(2, benDraws)),
  ).toBeNull()
})
