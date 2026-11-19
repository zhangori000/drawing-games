import type { TeamId } from '../types'
import { TEAM_IDS } from '../types'
import { creditLinkedMember, markMatchCredited } from './account-effects'
import { BOT_NAMES } from './constants'
import { handOffDrawerTurn } from './drawer-handoff'
import type { RoomContext } from './context'
import { patchState, reject, updateMatch, updateMember } from './context'
import { startMatch } from './match'
import {
  activeMembers,
  capMemory,
  chooseHost,
  findActiveMember,
  findMember,
  mergeMemory,
  teamRoster,
} from './members'
import { EMPTY_MEMBER_MATCH_STATS, EMPTY_WORD_MEMORY } from './records'
import { isMatchRunning } from './selectors'
import type { RoomSettings } from './settings'
import {
  MAX_MEMBERS_PER_TEAM,
  MAX_ROOM_MEMBERS,
  MIN_MEMBERS_PER_TEAM,
  TEAM_NAMES,
} from './settings'
import { applySettingsPatch, settingsEqual } from './settings-rules'
import { dedupeDisplayName, sanitizeDisplayName } from './text'
import type { RoomCommand, RoomMember, RoomState } from './types'
import { countCustomWords } from './words'

type Command<T extends RoomCommand['type']> = Extract<RoomCommand, { type: T }>

function isTeamId(value: unknown): value is TeamId {
  return value === 'A' || value === 'B'
}

function uniqueName(state: RoomState, raw: unknown, selfId: string): string {
  const taken = activeMembers(state)
    .filter((member) => member.id !== selfId)
    .map((member) => member.displayName)
  return dedupeDisplayName(sanitizeDisplayName(raw), taken)
}

function requireLobby(ctx: RoomContext, message: string): void {
  if (ctx.state.phase !== 'lobby') reject('NOT_ALLOWED', message)
}

function requireHost(ctx: RoomContext, actorId: string, message: string): void {
  if (ctx.state.hostId === null || ctx.state.hostId !== actorId) {
    reject('NOT_ALLOWED', message)
  }
}

function requireHuman(ctx: RoomContext, memberId: string): RoomMember {
  const member = findActiveMember(ctx.state, memberId)
  if (member === undefined || member.kind !== 'human') {
    reject('NOT_ALLOWED', 'You are not in this room.')
  }
  return member
}

/** Requested team if it has room, otherwise the smaller team (ties → A). */
function joinTeam(state: RoomState, preferred: TeamId | undefined): TeamId {
  const sizeA = teamRoster(state, 'A').length
  const sizeB = teamRoster(state, 'B').length
  if (preferred === 'A' && sizeA < MAX_MEMBERS_PER_TEAM) return 'A'
  if (preferred === 'B' && sizeB < MAX_MEMBERS_PER_TEAM) return 'B'
  return sizeB < sizeA ? 'B' : 'A'
}

/* ------------------------------------------------------------------------ */
/* Membership                                                               */
/* ------------------------------------------------------------------------ */

export function handleJoin(
  ctx: RoomContext,
  command: Command<'member.join'>,
): void {
  if (typeof command.memberId !== 'string' || command.memberId.length === 0) {
    reject('BAD_COMMAND', 'Missing member id.')
  }
  if (findMember(ctx.state, command.memberId) !== undefined) {
    reject('BAD_COMMAND', 'You are already in this room.')
  }
  if (activeMembers(ctx.state).length >= MAX_ROOM_MEMBERS) {
    reject('ROOM_FULL', `This room is full (${MAX_ROOM_MEMBERS} players).`)
  }
  const member: RoomMember = {
    id: command.memberId,
    kind: 'human',
    displayName: uniqueName(ctx.state, command.displayName, command.memberId),
    team: joinTeam(
      ctx.state,
      isTeamId(command.preferredTeam) ? command.preferredTeam : undefined,
    ),
    joinedAtMs: ctx.now,
    connected: true,
    lastSeenAtMs: ctx.now,
    ready: false,
    accountId: typeof command.accountId === 'string' ? command.accountId : null,
    memory: capMemory(command.memory),
  }
  patchState(ctx, {
    members: [...ctx.state.members, member],
    hostId: ctx.state.hostId ?? member.id,
  })
  if (isMatchRunning(ctx.state)) {
    updateMatch(ctx, (match) => ({
      ...match,
      stats: { ...match.stats, [member.id]: EMPTY_MEMBER_MATCH_STATS },
    }))
    if (member.accountId !== null) markMatchCredited(ctx, member.id)
  }
}

/**
 * For connected members `lastSeenAtMs` is when they (re)connected; for
 * disconnected members it is when they dropped (reconnect grace, host
 * transfer).
 */
export function handlePresence(
  ctx: RoomContext,
  command: Command<'member.presence'>,
): void {
  const member = requireHuman(ctx, command.memberId)
  if (typeof command.connected !== 'boolean') {
    reject('BAD_COMMAND', 'Presence must be connected or not.')
  }
  if (member.connected === command.connected) return
  updateMember(ctx, member.id, (current) => ({
    ...current,
    connected: command.connected,
    lastSeenAtMs: ctx.now,
  }))
}

export function handleLeave(
  ctx: RoomContext,
  command: Command<'member.leave'>,
): void {
  const member = requireHuman(ctx, command.memberId)
  if (ctx.state.phase === 'lobby') {
    patchState(ctx, {
      members: ctx.state.members.filter((entry) => entry.id !== member.id),
    })
  } else {
    updateMember(ctx, member.id, (current) => ({
      ...current,
      connected: false,
      ready: false,
      left: true,
      lastSeenAtMs: ctx.now,
    }))
    handOffDrawerTurn(ctx, member.id)
  }
  if (ctx.state.hostId === member.id) {
    patchState(ctx, { hostId: chooseHost(ctx.state, member.id) })
  }
}

export function handleLinkAccount(
  ctx: RoomContext,
  command: Command<'member.link-account'>,
): void {
  const member = requireHuman(ctx, command.memberId)
  const accountId =
    typeof command.accountId === 'string' ? command.accountId : null
  updateMember(ctx, member.id, (current) => ({
    ...current,
    accountId,
    memory: mergeMemory(current.memory, capMemory(command.memory)),
  }))
  // A guest who signs up mid-match or on the final screen keeps this match.
  if (accountId !== null) creditLinkedMember(ctx, member.id)
}

export function handleRename(
  ctx: RoomContext,
  command: Command<'member.rename'>,
): void {
  const member = requireHuman(ctx, command.memberId)
  const displayName = uniqueName(ctx.state, command.displayName, member.id)
  if (displayName === member.displayName) return
  updateMember(ctx, member.id, (current) => ({ ...current, displayName }))
}

/* ------------------------------------------------------------------------ */
/* Lobby                                                                    */
/* ------------------------------------------------------------------------ */

export function handleSetTeam(
  ctx: RoomContext,
  command: Command<'lobby.set-team'>,
): void {
  requireLobby(ctx, 'Teams can only change in the lobby.')
  const actor = requireHuman(ctx, command.actorId)
  const target = findActiveMember(ctx.state, command.memberId)
  if (target === undefined) reject('BAD_COMMAND', 'That player is not here.')
  if (target.id !== actor.id && ctx.state.hostId !== actor.id) {
    reject('NOT_ALLOWED', 'Only the host can move other players.')
  }
  if (!isTeamId(command.team)) reject('BAD_COMMAND', 'Unknown team.')
  if (target.team === command.team) return
  if (teamRoster(ctx.state, command.team).length >= MAX_MEMBERS_PER_TEAM) {
    reject('NOT_ALLOWED', `${TEAM_NAMES[command.team]} is full.`)
  }
  updateMember(ctx, target.id, (member) => ({ ...member, team: command.team }))
}

export function handleShuffleTeams(
  ctx: RoomContext,
  command: Command<'lobby.shuffle-teams'>,
): void {
  requireLobby(ctx, 'Teams can only change in the lobby.')
  requireHost(ctx, command.actorId, 'Only the host can shuffle teams.')
  const order = ctx.rng.shuffle(
    activeMembers(ctx.state).map((member) => member.id),
  )
  const teamOf = new Map(
    order.map((id, index) => [id, index % 2 === 0 ? 'A' : 'B'] as const),
  )
  patchState(ctx, {
    members: ctx.state.members.map((member) => {
      const team = teamOf.get(member.id)
      return team === undefined || team === member.team
        ? member
        : { ...member, team }
    }),
  })
}

export function handleSetReady(
  ctx: RoomContext,
  command: Command<'lobby.set-ready'>,
): void {
  requireLobby(ctx, 'Ready up in the lobby.')
  const actor = requireHuman(ctx, command.actorId)
  if (typeof command.ready !== 'boolean')
    reject('BAD_COMMAND', 'Ready must be on or off.')
  if (actor.ready === command.ready) return
  updateMember(ctx, actor.id, (member) => ({ ...member, ready: command.ready }))
}

export function handleUpdateSettings(
  ctx: RoomContext,
  command: Command<'lobby.update-settings'>,
): void {
  requireLobby(ctx, 'Settings can only change in the lobby.')
  requireHost(ctx, command.actorId, 'Only the host can change settings.')
  const settings: RoomSettings = applySettingsPatch(
    ctx.state.settings,
    command.patch,
  )
  if (settingsEqual(settings, ctx.state.settings)) return
  patchState(ctx, {
    settings,
    members: ctx.state.members.map((member) =>
      member.kind === 'human' && member.ready
        ? { ...member, ready: false }
        : member,
    ),
  })
}

export function handleAddBot(
  ctx: RoomContext,
  command: Command<'lobby.add-bot'>,
): void {
  requireLobby(ctx, 'Bots can only be added in the lobby.')
  requireHost(ctx, command.actorId, 'Only the host can add bots.')
  if (!isTeamId(command.team)) reject('BAD_COMMAND', 'Unknown team.')
  if (activeMembers(ctx.state).length >= MAX_ROOM_MEMBERS) {
    reject('ROOM_FULL', `This room is full (${MAX_ROOM_MEMBERS} players).`)
  }
  if (teamRoster(ctx.state, command.team).length >= MAX_MEMBERS_PER_TEAM) {
    reject('NOT_ALLOWED', `${TEAM_NAMES[command.team]} is full.`)
  }
  let number = ctx.state.nextBotNumber
  while (findMember(ctx.state, `bot_${number}`) !== undefined) number += 1
  const id = `bot_${number}`
  const baseName = BOT_NAMES[(number - 1) % BOT_NAMES.length] ?? 'Bot'
  const bot: RoomMember = {
    id,
    kind: 'bot',
    displayName: uniqueName(ctx.state, baseName, id),
    team: command.team,
    joinedAtMs: ctx.now,
    connected: true,
    lastSeenAtMs: ctx.now,
    ready: true,
    accountId: null,
    memory: EMPTY_WORD_MEMORY,
  }
  patchState(ctx, {
    members: [...ctx.state.members, bot],
    nextBotNumber: number + 1,
  })
}

export function handleRemoveMember(
  ctx: RoomContext,
  command: Command<'lobby.remove-member'>,
): void {
  requireLobby(ctx, 'Players can only be removed in the lobby.')
  requireHost(ctx, command.actorId, 'Only the host can remove players.')
  if (command.memberId === command.actorId) {
    reject('NOT_ALLOWED', "You can't remove yourself.")
  }
  if (findActiveMember(ctx.state, command.memberId) === undefined) {
    reject('BAD_COMMAND', 'That player is not here.')
  }
  patchState(ctx, {
    members: ctx.state.members.filter(
      (member) => member.id !== command.memberId,
    ),
  })
}

/** Plain-language reasons the host cannot start yet. */
export function lobbyBlockers(state: RoomState): string[] {
  const blockers: string[] = []
  for (const team of TEAM_IDS) {
    const size = teamRoster(state, team).length
    if (size < MIN_MEMBERS_PER_TEAM) {
      blockers.push(
        `${TEAM_NAMES[team]} needs at least ${MIN_MEMBERS_PER_TEAM} players`,
      )
    } else if (size > MAX_MEMBERS_PER_TEAM) {
      blockers.push(
        `${TEAM_NAMES[team]} has more than ${MAX_MEMBERS_PER_TEAM} players`,
      )
    }
  }
  for (const member of activeMembers(state)) {
    if (
      member.kind === 'human' &&
      member.connected &&
      member.id !== state.hostId &&
      !member.ready
    ) {
      blockers.push(`Waiting for ${member.displayName} to ready up`)
    }
  }
  const { customWordsMode, customWords, wordChoiceCount } = state.settings
  const customCount = countCustomWords(customWords)
  if (
    customWordsMode === 'only' &&
    customCount > 0 &&
    customCount < 2 * wordChoiceCount
  ) {
    blockers.push(
      `Add at least ${2 * wordChoiceCount} custom words, or mix them with packs`,
    )
  }
  return blockers
}

export function handleMatchStart(
  ctx: RoomContext,
  command: Command<'match.start'>,
): void {
  requireLobby(ctx, 'The match has already started.')
  requireHost(ctx, command.actorId, 'Only the host can start the match.')
  const [blocker] = lobbyBlockers(ctx.state)
  if (blocker !== undefined) reject('NOT_ALLOWED', `${blocker}.`)
  startMatch(ctx)
}
