import type { MemberView } from '@drawing-games/game-core'
import { describe, expect, it } from 'vitest'

import { turnPresenceNotice, type TurnPresenceInput } from './presence'

function member(id: string, overrides: Partial<MemberView> = {}): MemberView {
  return {
    id,
    displayName: id,
    team: 'B',
    kind: 'human',
    connected: true,
    ready: false,
    isHost: false,
    isDrawer: false,
    hasAccount: false,
    ...overrides,
  }
}

const members = [
  member('Cleo'),
  member('Dev'),
  member('Eve'),
  member('Ana', { team: 'A', connected: false }),
]

function input(overrides: Partial<TurnPresenceInput>): TurnPresenceInput {
  return {
    members,
    team: 'B',
    meId: 'Dev',
    drawerId: 'Cleo',
    amDrawer: false,
    done: false,
    ...overrides,
  }
}

describe('turnPresenceNotice', () => {
  it('says nothing while the drawer and a guesser are online', () => {
    expect(turnPresenceNotice(input({}))).toBeNull()
    expect(
      turnPresenceNotice(input({ meId: 'Cleo', amDrawer: true })),
    ).toBeNull()
  })

  it('tells a guesser their drawer lost connection', () => {
    const away = members.map((m) =>
      m.id === 'Cleo' ? { ...m, connected: false } : m,
    )
    expect(turnPresenceNotice(input({ members: away }))).toEqual({
      message: 'Cleo lost connection. Waiting for them to come back.',
      short: 'Cleo lost connection',
    })
    // Solved (or every Showdown card cleared): nobody is waiting.
    expect(turnPresenceNotice(input({ members: away, done: true }))).toBeNull()
    // Between Showdown cards there is no drawer.
    expect(
      turnPresenceNotice(input({ members: away, drawerId: null })),
    ).toBeNull()
  })

  it('tells a drawer when every teammate is offline', () => {
    const alone = members.map((m) =>
      m.team === 'B' && m.id !== 'Cleo' ? { ...m, connected: false } : m,
    )
    const drawer = input({ members: alone, meId: 'Cleo', amDrawer: true })
    expect(turnPresenceNotice(drawer)?.message).toBe(
      'Nobody on your team is online to guess right now. Keep drawing for when they’re back.',
    )
    expect(turnPresenceNotice(drawer)?.short).toBeNull()
    // One guesser back (or a practice bot, always online) is enough.
    const oneBack = alone.map((m) =>
      m.id === 'Eve' ? { ...m, connected: true } : m,
    )
    expect(turnPresenceNotice({ ...drawer, members: oneBack })).toBeNull()
    // The other team's presence does not matter.
    expect(
      turnPresenceNotice({
        ...drawer,
        members: alone.filter((m) => m.team === 'B'),
      }),
    ).not.toBeNull()
  })
})
