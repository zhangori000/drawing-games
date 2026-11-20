import { describe, expect, it } from 'vitest'

import {
  assertRoomInvariants,
  createRoomState,
  getNextWakeAtMs,
} from './engine'
import { DEFAULT_ROOM_SETTINGS, MAX_ROOM_MEMBERS } from './settings'
import { customWordList, RoomDriver } from './test-driver'

function lobbyWithHost(): RoomDriver {
  const driver = new RoomDriver()
  driver.join('host', 'Host')
  return driver
}

describe('createRoomState', () => {
  it('creates an empty lobby with default settings and a uint32 seed', () => {
    const state = createRoomState({ roomCode: 'ABCDE', nowMs: 5, seed: -1 })
    expect(state).toMatchObject({
      phase: 'lobby',
      hostId: null,
      seq: 0,
      members: [],
      match: null,
      settings: DEFAULT_ROOM_SETTINGS,
      rngState: 2 ** 32 - 1,
    })
    expect(getNextWakeAtMs(state)).toBeNull()
    assertRoomInvariants(state)
  })
})

describe('membership', () => {
  it('makes the first human host and fills teams by request, cap, and size', () => {
    const driver = lobbyWithHost()
    expect(driver.state.hostId).toBe('host')
    expect(driver.state.members[0]?.team).toBe('A')

    driver.join('p2', 'P2')
    expect(driver.state.members[1]?.team).toBe('B')
    driver.join('p3', 'P3', { team: 'B' })
    expect(driver.state.members[2]?.team).toBe('B')
    driver.join('p4', 'P4')
    expect(driver.state.members[3]?.team).toBe('A')
    expect(driver.state.hostId).toBe('host')
  })

  it('cleans, caps, and de-duplicates display names', () => {
    const driver = lobbyWithHost()
    driver.join('m1', '  Mina \u0007  Lee  ')
    driver.join('m2', 'mina lee')
    driver.join('m3', '   ')
    driver.join('m4', 'A very long display name that keeps going')
    driver.join('m5', 'A very long display name that keeps going')
    const names = driver.state.members.map((member) => member.displayName)
    expect(names).toEqual([
      'Host',
      'Mina Lee',
      'mina lee 2',
      'Player',
      'A very long display name',
      'A very long display name'.slice(0, 22).trimEnd() + ' 2',
    ])
    expect(names.every((name) => Array.from(name).length <= 24)).toBe(true)
  })

  it('rejects duplicate ids and a full room', () => {
    const driver = lobbyWithHost()
    expect(
      driver.fail({
        type: 'member.join',
        memberId: 'host',
        displayName: 'Again',
        accountId: null,
        memory: { avoid: [], soft: [] },
      }).code,
    ).toBe('BAD_COMMAND')
    for (let index = 1; index < MAX_ROOM_MEMBERS; index += 1) {
      driver.join(`p${index}`, `P${index}`)
    }
    const error = driver.fail({
      type: 'member.join',
      memberId: 'late',
      displayName: 'Late',
      accountId: null,
      memory: { avoid: [], soft: [] },
    })
    expect(error.code).toBe('ROOM_FULL')
    expect(error.message).toMatch(/full/)
  })

  it('caps joined memory and drops junk ids', () => {
    const driver = lobbyWithHost()
    const avoid = Array.from({ length: 700 }, (_, index) => `w${index}`)
    driver.join('mem', 'Mem', { memory: { avoid: [...avoid, 'w1'], soft: [] } })
    const member = driver.state.members.find((entry) => entry.id === 'mem')
    expect(member?.memory.avoid).toHaveLength(600)
    expect(new Set(member?.memory.avoid).size).toBe(600)
  })

  it('updates presence and ignores no-op presence', () => {
    const driver = lobbyWithHost()
    driver.join('p2', 'P2')
    const seq = driver.state.seq
    driver.ok({ type: 'member.presence', memberId: 'p2', connected: true })
    expect(driver.state.seq).toBe(seq)
    driver.now += 100
    driver.ok({ type: 'member.presence', memberId: 'p2', connected: false })
    expect(driver.state.members[1]).toMatchObject({
      connected: false,
      lastSeenAtMs: driver.now,
    })
    expect(driver.state.seq).toBe(seq + 1)
    expect(driver.state.lastActivityAtMs).toBe(driver.now)
  })

  it('removes lobby leavers and hands host to the earliest connected human', () => {
    const driver = lobbyWithHost()
    driver.join('p2', 'P2')
    driver.join('p3', 'P3')
    driver.ok({ type: 'member.presence', memberId: 'p2', connected: false })
    driver.ok({ type: 'member.leave', memberId: 'host' })
    expect(driver.state.members.map((member) => member.id)).toEqual([
      'p2',
      'p3',
    ])
    expect(driver.state.hostId).toBe('p3')
  })

  it('transfers host after 15 s disconnected while another human is connected', () => {
    const driver = lobbyWithHost()
    driver.join('p2', 'P2')
    driver.ok({ type: 'member.presence', memberId: 'host', connected: false })
    const disconnectedAt = driver.now
    expect(getNextWakeAtMs(driver.state)).toBe(disconnectedAt + 15_000)
    driver.advanceTo(disconnectedAt + 14_999)
    expect(driver.state.hostId).toBe('host')
    driver.advanceTo(disconnectedAt + 15_000)
    expect(driver.state.hostId).toBe('p2')
    expect(getNextWakeAtMs(driver.state)).toBeNull()
  })

  it('transfers a long-gone host as soon as another human connects', () => {
    const driver = lobbyWithHost()
    driver.join('p2', 'P2')
    driver.ok({ type: 'member.presence', memberId: 'p2', connected: false })
    driver.ok({ type: 'member.presence', memberId: 'host', connected: false })
    driver.advanceBy(60_000)
    expect(driver.state.hostId).toBe('host')
    driver.ok({ type: 'member.presence', memberId: 'p2', connected: true })
    expect(driver.state.hostId).toBe('p2')
  })

  it('renames and links accounts', () => {
    const driver = lobbyWithHost()
    driver.join('p2', 'P2')
    driver.ok({ type: 'member.rename', memberId: 'p2', displayName: 'host' })
    expect(driver.state.members[1]?.displayName).toBe('host 2')
    driver.ok({
      type: 'member.link-account',
      memberId: 'p2',
      accountId: 'pat',
      memory: { avoid: ['x/1'], soft: ['x/2'] },
    })
    expect(driver.state.members[1]).toMatchObject({
      accountId: 'pat',
      memory: { avoid: ['x/1'], soft: ['x/2'] },
    })
    expect(driver.view('p2').me?.accountId).toBe('pat')
  })
})

describe('lobby controls', () => {
  it('lets members move themselves and the host move anyone, up to 8 per team', () => {
    const driver = lobbyWithHost()
    driver.join('p2', 'P2')
    driver.ok({
      type: 'lobby.set-team',
      actorId: 'p2',
      memberId: 'p2',
      team: 'A',
    })
    expect(driver.state.members[1]?.team).toBe('A')
    expect(
      driver.fail({
        type: 'lobby.set-team',
        actorId: 'p2',
        memberId: 'host',
        team: 'B',
      }).code,
    ).toBe('NOT_ALLOWED')
    driver.ok({
      type: 'lobby.set-team',
      actorId: 'host',
      memberId: 'p2',
      team: 'B',
    })
    expect(driver.state.members[1]?.team).toBe('B')

    for (let index = 0; index < 7; index += 1) {
      driver.ok({ type: 'lobby.add-bot', actorId: 'host', team: 'A' })
    }
    expect(
      driver.fail({ type: 'lobby.add-bot', actorId: 'host', team: 'A' })
        .message,
    ).toBe('Sun is full.')
    expect(
      driver.fail({
        type: 'lobby.set-team',
        actorId: 'p2',
        memberId: 'p2',
        team: 'A',
      }).message,
    ).toBe('Sun is full.')
  })

  it('adds bots with cycling names, always ready, never with accounts', () => {
    const driver = lobbyWithHost()
    for (let index = 0; index < 9; index += 1) {
      driver.ok({
        type: 'lobby.add-bot',
        actorId: 'host',
        team: index % 2 ? 'A' : 'B',
      })
    }
    const bots = driver.state.members.filter((member) => member.kind === 'bot')
    expect(bots.map((bot) => bot.id)).toEqual(
      Array.from({ length: 9 }, (_, index) => `bot_${index + 1}`),
    )
    expect(bots.map((bot) => bot.displayName)).toEqual([
      'Pixel Pete',
      'Doodlebot',
      'Sketchy',
      'Inkling',
      'Scribbles',
      'Smudge',
      'Squiggles',
      'Blotto',
      'Pixel Pete 2',
    ])
    expect(
      bots.every((bot) => bot.ready && bot.connected && bot.accountId === null),
    ).toBe(true)
    expect(
      driver.fail({ type: 'lobby.add-bot', actorId: 'bot_1', team: 'A' }).code,
    ).toBe('NOT_ALLOWED')
  })

  it('shuffles all members into balanced teams with the seeded PRNG', () => {
    const driver = lobbyWithHost()
    for (let index = 0; index < 6; index += 1) {
      driver.ok({ type: 'lobby.add-bot', actorId: 'host', team: 'A' })
    }
    const before = driver.state.rngState
    driver.ok({ type: 'lobby.shuffle-teams', actorId: 'host' })
    const sizes = { A: 0, B: 0 }
    for (const member of driver.state.members) sizes[member.team] += 1
    expect(Math.abs(sizes.A - sizes.B)).toBeLessThanOrEqual(1)
    expect(driver.state.rngState).not.toBe(before)
  })

  it('validates settings, drops unknown packs, cleans custom words, and clears ready', () => {
    const driver = lobbyWithHost()
    driver.join('p2', 'P2')
    driver.ok({ type: 'lobby.set-ready', actorId: 'p2', ready: true })

    driver.settings('host', {
      rounds: 4,
      packIds: ['animals', 'nope', 'animals', 'food'],
      customWords: [
        '  Ice \t cream ',
        'ice cream',
        'x',
        'bad\u0000word',
        'a'.repeat(33),
      ],
    })
    expect(driver.state.settings).toMatchObject({
      rounds: 4,
      packIds: ['animals', 'food'],
      customWords: ['Ice cream', 'badword'],
    })
    expect(driver.state.members[1]?.ready).toBe(false)

    const invalid: Parameters<RoomDriver['settings']>[1][] = [
      { rounds: 5 },
      { rounds: 18 },
      { drawingSeconds: 50 },
      { wordChoiceCount: 6 },
      { replacementsPerDrawer: -1 },
      { hintCost: 51 },
      { showdownSeconds: 100 },
      { packIds: [] },
      { packIds: ['nope'] },
      {
        customWords: Array.from({ length: 301 }, (_, index) => `word ${index}`),
      },
    ]
    for (const patch of invalid) {
      const error = driver.fail({
        type: 'lobby.update-settings',
        actorId: 'host',
        patch,
      })
      expect(error.code).toBe('BAD_COMMAND')
      expect(error.message.length).toBeGreaterThan(0)
    }
    expect(
      driver.fail({
        type: 'lobby.update-settings',
        actorId: 'p2',
        patch: { rounds: 2 },
      }).code,
    ).toBe('NOT_ALLOWED')

    driver.settings('host', {
      packIds: [],
      customWordsMode: 'only',
      customWords: customWordList(6),
    })
    expect(driver.state.settings.packIds).toEqual([])
  })

  it('does not clear ready flags for an unchanged settings patch', () => {
    const driver = lobbyWithHost()
    driver.join('p2', 'P2')
    driver.ok({ type: 'lobby.set-ready', actorId: 'p2', ready: true })
    const seq = driver.state.seq
    driver.settings('host', { rounds: DEFAULT_ROOM_SETTINGS.rounds })
    expect(driver.state.members[1]?.ready).toBe(true)
    expect(driver.state.seq).toBe(seq)
  })

  it('reports start blockers in plain words and starts once they clear', () => {
    const driver = lobbyWithHost()
    driver.join('theo', 'Theo')
    expect(driver.view('host').lobby?.blockers).toEqual([
      'Sun needs at least 2 players',
      'Moon needs at least 2 players',
      'Waiting for Theo to ready up',
    ])
    expect(driver.fail({ type: 'match.start', actorId: 'host' }).message).toBe(
      'Sun needs at least 2 players.',
    )
    driver.ok({ type: 'lobby.add-bot', actorId: 'host', team: 'A' })
    driver.ok({ type: 'lobby.add-bot', actorId: 'host', team: 'B' })
    expect(driver.view('host').lobby).toMatchObject({
      canStart: false,
      blockers: ['Waiting for Theo to ready up'],
      minPerTeam: 2,
      maxPerTeam: 8,
    })
    // Offline, Theo no longer counts toward Moon's minimum.
    driver.ok({ type: 'member.presence', memberId: 'theo', connected: false })
    expect(driver.view('host').lobby).toMatchObject({
      canStart: false,
      blockers: ['Theo is offline, so Moon would start with 1 player'],
    })
    driver.ok({ type: 'member.presence', memberId: 'theo', connected: true })
    driver.ok({ type: 'lobby.set-ready', actorId: 'theo', ready: true })
    expect(driver.fail({ type: 'match.start', actorId: 'theo' }).code).toBe(
      'NOT_ALLOWED',
    )
    driver.ok({ type: 'match.start', actorId: 'host' })
    expect(driver.state.phase).toBe('word-draft')
  })

  it('clears Ready when a player drops out of the lobby, not mid-match', () => {
    const driver = lobbyWithHost()
    driver.join('ben', 'Ben', { team: 'A' })
    driver.join('cleo', 'Cleo', { team: 'B' })
    driver.join('dev', 'Dev', { team: 'B' })
    for (const id of ['ben', 'cleo', 'dev']) {
      driver.ok({ type: 'lobby.set-ready', actorId: id, ready: true })
    }
    driver.ok({ type: 'member.presence', memberId: 'dev', connected: false })
    expect(driver.state.members.find((m) => m.id === 'dev')).toMatchObject({
      connected: false,
      ready: false,
    })
    // Back within the grace or not, they ready up again before the start.
    driver.ok({ type: 'member.presence', memberId: 'dev', connected: true })
    expect(driver.view('host').lobby?.blockers).toEqual([
      'Waiting for Dev to ready up',
    ])
    driver.ok({ type: 'lobby.set-ready', actorId: 'dev', ready: true })
    driver.ok({ type: 'match.start', actorId: 'host' })
    // A mid-match drop leaves the flag alone (the lobby resets it later).
    driver.ok({ type: 'member.presence', memberId: 'ben', connected: false })
    expect(driver.state.members.find((m) => m.id === 'ben')?.ready).toBe(true)
  })

  it('counts only players who are here toward a team minimum', () => {
    // The playtest room: Sun is Ana, Ben and Eve; Moon is Cleo and Dev.
    const driver = new RoomDriver()
    driver.join('ana', 'Ana')
    driver.join('ben', 'Ben', { team: 'A' })
    driver.join('eve', 'Eve', { team: 'A' })
    driver.join('cleo', 'Cleo', { team: 'B' })
    driver.join('dev', 'Dev', { team: 'B' })
    for (const id of ['ben', 'eve', 'cleo', 'dev']) {
      driver.ok({ type: 'lobby.set-ready', actorId: id, ready: true })
    }
    expect(driver.view('ana').lobby?.canStart).toBe(true)

    driver.ok({ type: 'member.presence', memberId: 'dev', connected: false })
    driver.advanceBy(17_000)
    expect(driver.view('ana').lobby).toMatchObject({
      canStart: false,
      blockers: ['Dev is offline, so Moon would start with 1 player'],
    })
    expect(driver.fail({ type: 'match.start', actorId: 'ana' }).message).toBe(
      'Dev is offline, so Moon would start with 1 player.',
    )
    // Sun still has two here without Eve, so her absence does not block.
    driver.ok({ type: 'member.presence', memberId: 'eve', connected: false })
    expect(driver.view('ana').lobby?.blockers).toEqual([
      'Dev is offline, so Moon would start with 1 player',
    ])
    driver.ok({ type: 'member.presence', memberId: 'cleo', connected: false })
    expect(driver.view('ana').lobby?.blockers).toEqual([
      'Cleo and Dev are offline, so Moon would start with nobody',
    ])

    // A practice bot fills the gap like any player who is here.
    driver.ok({ type: 'member.presence', memberId: 'cleo', connected: true })
    driver.ok({ type: 'lobby.add-bot', actorId: 'ana', team: 'B' })
    expect(driver.view('ana').lobby?.blockers).toEqual([
      'Waiting for Cleo to ready up',
    ])
    driver.ok({ type: 'lobby.set-ready', actorId: 'cleo', ready: true })
    driver.ok({ type: 'match.start', actorId: 'ana' })
    expect(driver.state.phase).toBe('word-draft')
  })

  it('blocks a custom-only room with too few words', () => {
    const driver = lobbyWithHost()
    driver.settings('host', {
      customWordsMode: 'only',
      customWords: customWordList(3),
    })
    expect(driver.view('host').lobby?.blockers).toContain(
      'Add at least 6 custom words, or mix them with packs',
    )
  })

  it('removes members (not self) only as host in the lobby', () => {
    const driver = lobbyWithHost()
    driver.join('p2', 'P2')
    expect(
      driver.fail({
        type: 'lobby.remove-member',
        actorId: 'host',
        memberId: 'host',
      }).code,
    ).toBe('NOT_ALLOWED')
    expect(
      driver.fail({
        type: 'lobby.remove-member',
        actorId: 'p2',
        memberId: 'host',
      }).code,
    ).toBe('NOT_ALLOWED')
    driver.ok({ type: 'lobby.remove-member', actorId: 'host', memberId: 'p2' })
    expect(driver.state.members.map((member) => member.id)).toEqual(['host'])
  })

  it('counts pool words nobody has seen as fresh', () => {
    const driver = lobbyWithHost()
    const words = customWordList(10)
    driver.settings('host', {
      customWordsMode: 'only',
      customWords: words,
      packIds: [],
    })
    const lobby = driver.view('host').lobby
    expect(lobby?.poolSize).toBe(10)
    expect(lobby?.freshWordCount).toBe(10)
    driver.join('p2', 'P2', {
      memory: { avoid: [`custom/${words[0]}`], soft: [`custom/${words[1]}`] },
    })
    expect(driver.view('host').lobby?.freshWordCount).toBe(8)
  })

  it('counts a custom word as seen when its curated twin was remembered', () => {
    const driver = lobbyWithHost()
    const words = [...customWordList(12), 'chair', 'Treasure Chest']
    driver.settings('host', {
      customWordsMode: 'only',
      customWords: words,
      packIds: [],
    })
    expect(driver.view('host').lobby).toMatchObject({
      poolSize: 14,
      freshWordCount: 14,
    })
    // The same answer under a curated id, as account history stores it.
    driver.join('p2', 'P2', {
      memory: {
        avoid: ['everyday/chair'],
        soft: ['fantasy/treasure-chest', `custom/${words[0]}`],
      },
    })
    expect(driver.view('host').lobby).toMatchObject({
      poolSize: 14,
      freshWordCount: 11,
    })
  })

  it('rejects lobby-only commands outside the lobby', () => {
    const driver = lobbyWithHost()
    driver.join('p2', 'P2')
    driver.ok({ type: 'lobby.add-bot', actorId: 'host', team: 'A' })
    driver.ok({ type: 'lobby.add-bot', actorId: 'host', team: 'B' })
    driver.readyAll()
    driver.ok({ type: 'match.start', actorId: 'host' })
    for (const command of [
      { type: 'lobby.add-bot', actorId: 'host', team: 'A' },
      { type: 'lobby.shuffle-teams', actorId: 'host' },
      { type: 'lobby.set-ready', actorId: 'p2', ready: false },
      { type: 'lobby.update-settings', actorId: 'host', patch: { rounds: 2 } },
      { type: 'match.start', actorId: 'host' },
    ] as const) {
      expect(driver.fail(command).code).toBe('NOT_ALLOWED')
    }
  })
})
