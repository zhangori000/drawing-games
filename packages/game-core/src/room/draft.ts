import type { TeamId } from '../types'
import { otherTeam, TEAM_IDS, WORD_REPLACEMENT_REASONS } from '../types'
import type { RoomContext } from './context'
import { reject, requireRound, updateMember, updateTeamRound } from './context'
import { startDrawing } from './drawing'
import { findActiveMember, rememberWords, teamRoster } from './members'
import type {
  DraftOption,
  RoomCommand,
  RoomMember,
  TeamRoundState,
} from './types'
import {
  drawnInRoom,
  recordOffers,
  roomPool,
  roomUsedKeys,
  selectDraftWords,
  toDraftOption,
} from './words'

type Command<T extends RoomCommand['type']> = Extract<RoomCommand, { type: T }>

function lockWord(
  ctx: RoomContext,
  team: TeamId,
  wordId: string,
  chosenBy: 'drawer' | 'auto',
): void {
  updateTeamRound(ctx, team, (teamRound) => ({
    ...teamRound,
    chosenWordId: wordId,
    chosenBy,
  }))
  const round = requireRound(ctx.state)
  if (TEAM_IDS.every((id) => round.teams[id].chosenWordId !== null)) {
    startDrawing(ctx)
  }
}

/** The actor's team round, if they are its drawer during an open draft. */
function requireOpenDraft(
  ctx: RoomContext,
  actorId: string,
): { readonly drawer: RoomMember; readonly teamRound: TeamRoundState } {
  if (ctx.state.phase !== 'word-draft') {
    reject('NOT_ALLOWED', 'Words are picked during the word draft.')
  }
  const drawer = findActiveMember(ctx.state, actorId)
  const teamRound =
    drawer === undefined
      ? undefined
      : requireRound(ctx.state).teams[drawer.team]
  if (drawer === undefined || teamRound?.drawerId !== drawer.id) {
    reject('NOT_ALLOWED', 'Only the drawer picks the word.')
  }
  if (teamRound.chosenWordId !== null) {
    reject('NOT_ALLOWED', 'Your word is already locked in.')
  }
  return { drawer, teamRound }
}

export function handleDraftSelect(
  ctx: RoomContext,
  command: Command<'draft.select'>,
): void {
  const { drawer, teamRound } = requireOpenDraft(ctx, command.actorId)
  if (!teamRound.options.some((option) => option.wordId === command.wordId)) {
    reject('BAD_COMMAND', 'That word is not one of your cards.')
  }
  lockWord(ctx, drawer.team, command.wordId, 'drawer')
}

/**
 * Swaps one card for another of the same difficulty, excluding every live
 * card (both teams') and every word replaced earlier this round; refused
 * when no such word is left (tiny custom-only lists). "Seen it" goes to the
 * drawer's in-room avoid memory, "don't know it" to soft memory.
 */
export function handleDraftReplace(
  ctx: RoomContext,
  command: Command<'draft.replace'>,
): void {
  const { drawer, teamRound } = requireOpenDraft(ctx, command.actorId)
  if (!WORD_REPLACEMENT_REASONS.includes(command.reason)) {
    reject('BAD_COMMAND', 'Pick a reason for swapping the word.')
  }
  const allowance = ctx.state.settings.replacementsPerDrawer
  if (teamRound.replacements.length >= allowance) {
    reject(
      'NOT_ALLOWED',
      allowance === 0
        ? 'Word swaps are off in this room.'
        : 'You have used all your word swaps.',
    )
  }
  const index = teamRound.options.findIndex(
    (option) => option.wordId === command.wordId,
  )
  const replaced = teamRound.options[index]
  if (replaced === undefined) {
    reject('BAD_COMMAND', 'That word is not one of your cards.')
  }

  const round = requireRound(ctx.state)
  const opponent = round.teams[otherTeam(drawer.team)]
  const random = () => ctx.rng.next()
  const [replacement] = selectDraftWords(
    {
      pool: roomPool(ctx.state.settings),
      slots: [replaced.difficulty],
      drawer,
      teammates: teamRoster(ctx.state, drawer.team).filter(
        (member) => member.id !== drawer.id,
      ),
      ownCards: teamRound.options,
      opponentCards: opponent.options,
      replacedWordIds: TEAM_IDS.flatMap((team) =>
        round.teams[team].replacements.map((entry) => entry.replacedWordId),
      ),
      wordMemory: ctx.state.wordMemory,
      // Never the other team's cards: one could be their locked answer.
      allowOpponentCards: false,
    },
    random,
  )
  if (replacement === undefined) {
    reject('NOT_ALLOWED', 'There are no other words left to swap in.')
  }

  recordOffers(ctx, [replacement.id])
  updateTeamRound(ctx, drawer.team, (current) => ({
    ...current,
    options: current.options.map((option, optionIndex) =>
      optionIndex === index ? toDraftOption(replacement) : option,
    ),
    replacements: [
      ...current.replacements,
      {
        reason: command.reason,
        actorId: drawer.id,
        replacedWordId: replaced.wordId,
        replacementWordId: replacement.id,
        atMs: ctx.now,
      },
    ],
  }))
  updateMember(ctx, drawer.id, (member) => ({
    ...member,
    memory: rememberWords(
      member.memory,
      command.reason === 'seen-before' ? 'avoid' : 'soft',
      [replaced.wordId],
    ),
  }))
}

/**
 * A random card for a drawer who is not choosing (the deadline, or a bot):
 * one never drawn in this room when there is one, so the room only repeats
 * a word when every card left is a repeat.
 */
function automaticPick(
  ctx: RoomContext,
  teamRound: TeamRoundState,
): DraftOption {
  const usedKeys = roomUsedKeys(
    roomPool(ctx.state.settings),
    ctx.state.wordMemory.usedWordIds,
  )
  const fresh = teamRound.options.filter(
    (option) => !drawnInRoom(usedKeys, option),
  )
  return ctx.rng.pick(fresh.length > 0 ? fresh : teamRound.options)
}

/** Draft deadline: every unchosen team gets a random remaining card. */
export function autoPickAndStartDrawing(ctx: RoomContext): void {
  for (const team of TEAM_IDS) {
    const teamRound = requireRound(ctx.state).teams[team]
    if (teamRound.chosenWordId !== null) continue
    lockWord(ctx, team, automaticPick(ctx, teamRound).wordId, 'auto')
  }
}

/** A practice bot drawer picks one of its cards at random. */
export function botPickWord(ctx: RoomContext, botId: string): void {
  if (ctx.state.phase !== 'word-draft') return
  const bot = findActiveMember(ctx.state, botId)
  if (bot === undefined) return
  const teamRound = requireRound(ctx.state).teams[bot.team]
  if (teamRound.drawerId !== bot.id || teamRound.chosenWordId !== null) return
  lockWord(ctx, bot.team, automaticPick(ctx, teamRound).wordId, 'drawer')
}
