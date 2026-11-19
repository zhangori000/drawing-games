import {
  buildWordPool,
  CUSTOM_PACK_ID,
  getPlayableWordById,
  getWordPackName,
  selectDraftOptions,
  wordStems,
  type PlayableWord,
} from '@drawing-games/word-bank'

import type { WordDifficulty } from '../types'
import { RECENT_PACKS_CAP, USED_WORDS_CAP } from './constants'
import type { RoomContext } from './context'
import type { RoomSettings } from './settings'
import type { DraftOption, RoomMember, RoomWordMemory } from './types'

const POOL_CACHE = new WeakMap<RoomSettings, readonly PlayableWord[]>()

/** The room's playable pool. Memoized per (immutable) settings object. */
export function roomPool(settings: RoomSettings): readonly PlayableWord[] {
  const cached = POOL_CACHE.get(settings)
  if (cached !== undefined) return cached
  const pool = buildWordPool({
    packIds: settings.packIds,
    customWords: settings.customWords,
    customWordsMode: settings.customWordsMode,
  })
  POOL_CACHE.set(settings, pool)
  return pool
}

/** Custom words that survive the word engine's own normalization. */
export function countCustomWords(customWords: readonly string[]): number {
  return buildWordPool({
    packIds: [],
    customWords,
    customWordsMode: 'only',
  }).filter((word) => word.packId === CUSTOM_PACK_ID).length
}

export function toDraftOption(word: PlayableWord): DraftOption {
  return {
    wordId: word.id,
    term: word.term,
    difficulty: word.difficulty,
    packId: word.packId,
    packName: getWordPackName(word.packId),
    definition: word.definition,
    aliases: [...word.aliases],
  }
}

export interface WordFacts {
  readonly wordId: string
  readonly term: string
  readonly packId: string
  readonly difficulty: WordDifficulty
}

/** Looks a word up in the pool, the curated catalog, or a custom-word id. */
export function lookupWord(
  pool: readonly PlayableWord[],
  wordId: string,
): WordFacts {
  const word =
    pool.find((entry) => entry.id === wordId) ?? getPlayableWordById(wordId)
  if (word !== undefined) {
    return {
      wordId,
      term: word.term,
      packId: word.packId,
      difficulty: word.difficulty,
    }
  }
  const slash = wordId.indexOf('/')
  const packId = slash > 0 ? wordId.slice(0, slash) : CUSTOM_PACK_ID
  return {
    wordId,
    term: wordId.slice(slash + 1).replace(/-/g, ' '),
    packId,
    difficulty: 'medium',
  }
}

/* ------------------------------------------------------------------------ */
/* Draft selection                                                          */
/* ------------------------------------------------------------------------ */

const RECENT_OFFER_WINDOW = 6
const RECENT_OFFER_PENALTY = 0.05
const EARLIER_OFFER_PENALTY = 0.35
const DRAWER_SOFT_PENALTY = 0.2
const TEAMMATE_MEMORY_PENALTY = 0.3
const RECENT_PACK_PENALTY = 0.6
const MIN_PENALTY = 0.01
/** Room-used exclusions relax once fewer than this many × cards remain. */
const USED_EXCLUSION_RESERVE = 4

export interface DraftRequest {
  readonly pool: readonly PlayableWord[]
  readonly slots: readonly WordDifficulty[]
  readonly drawer: RoomMember
  readonly teammates: readonly RoomMember[]
  /** This team's other live cards (when drawing a replacement). */
  readonly ownCards: readonly DraftOption[]
  /** The other team's cards this round. */
  readonly opponentCards: readonly DraftOption[]
  /** Words replaced earlier this round by either team. */
  readonly replacedWordIds: readonly string[]
  readonly wordMemory: RoomWordMemory
  readonly wordChoiceCount: number
}

/**
 * Words drawn in this room stay excluded until fewer than
 * `4 × wordChoiceCount` pool words would remain; then only the most recent
 * half of the used list (within the pool) stays excluded.
 */
function roomUsedExclusions(
  pool: readonly PlayableWord[],
  usedWordIds: readonly string[],
  wordChoiceCount: number,
): Set<string> {
  const poolIds = new Set(pool.map((word) => word.id))
  const newestFirst: string[] = []
  const seen = new Set<string>()
  for (let index = usedWordIds.length - 1; index >= 0; index -= 1) {
    const id = usedWordIds[index] as string
    if (!poolIds.has(id) || seen.has(id)) continue
    seen.add(id)
    newestFirst.push(id)
  }
  const reserve = USED_EXCLUSION_RESERVE * wordChoiceCount
  if (pool.length - newestFirst.length >= reserve) return seen
  return new Set(newestFirst.slice(0, Math.ceil(newestFirst.length / 2)))
}

function draftPenalties(request: DraftRequest): Map<string, number> {
  const penalties = new Map<string, number>()
  const multiply = (wordId: string, factor: number) => {
    penalties.set(wordId, (penalties.get(wordId) ?? 1) * factor)
  }
  const { draftCounter, offeredAt } = request.wordMemory
  for (const [wordId, offeredDraft] of Object.entries(offeredAt)) {
    multiply(
      wordId,
      draftCounter - offeredDraft < RECENT_OFFER_WINDOW
        ? RECENT_OFFER_PENALTY
        : EARLIER_OFFER_PENALTY,
    )
  }
  for (const wordId of new Set(request.drawer.memory.soft)) {
    multiply(wordId, DRAWER_SOFT_PENALTY)
  }
  for (const teammate of request.teammates) {
    const remembered = new Set([
      ...teammate.memory.avoid,
      ...teammate.memory.soft,
    ])
    for (const wordId of remembered) multiply(wordId, TEAMMATE_MEMORY_PENALTY)
  }
  for (const [wordId, factor] of penalties) {
    penalties.set(wordId, Math.max(MIN_PENALTY, factor))
  }
  return penalties
}

function recentPackPenalties(wordMemory: RoomWordMemory): Map<string, number> {
  return new Map(
    wordMemory.recentPackIds
      .slice(0, 2)
      .map((packId) => [packId, RECENT_PACK_PENALTY] as const),
  )
}

function lastDrawnStems(
  pool: readonly PlayableWord[],
  wordMemory: RoomWordMemory,
): string[] {
  return wordMemory.usedWordIds
    .slice(-2)
    .flatMap((wordId) => wordStems(lookupWord(pool, wordId).term))
}

interface ExclusionTier {
  readonly roomUsed: boolean
  readonly drawerAvoid: boolean
  readonly opponentCards: boolean
}

/**
 * Hard exclusions relax tier by tier only when a tiny pool cannot fill the
 * slots; the opponent's cards are the last thing given up.
 */
const EXCLUSION_TIERS: readonly ExclusionTier[] = [
  { roomUsed: true, drawerAvoid: true, opponentCards: true },
  { roomUsed: false, drawerAvoid: true, opponentCards: true },
  { roomUsed: false, drawerAvoid: false, opponentCards: true },
  { roomUsed: false, drawerAvoid: false, opponentCards: false },
]

/** Picks draft cards for one drawer, following the layered word memory. */
export function selectDraftWords(
  request: DraftRequest,
  random: () => number,
): PlayableWord[] {
  const penalties = draftPenalties(request)
  const packPenalties = recentPackPenalties(request.wordMemory)
  const avoidStems = new Set([
    ...request.ownCards.flatMap((card) => wordStems(card.term)),
    ...request.opponentCards.flatMap((card) => wordStems(card.term)),
    ...lastDrawnStems(request.pool, request.wordMemory),
  ])
  const used = roomUsedExclusions(
    request.pool,
    request.wordMemory.usedWordIds,
    request.wordChoiceCount,
  )

  let best: PlayableWord[] = []
  for (const tier of EXCLUSION_TIERS) {
    const hardExclude = new Set<string>([
      ...request.ownCards.map((card) => card.wordId),
      ...request.replacedWordIds,
    ])
    if (tier.roomUsed) for (const id of used) hardExclude.add(id)
    if (tier.drawerAvoid) {
      for (const id of request.drawer.memory.avoid) hardExclude.add(id)
    }
    if (tier.opponentCards) {
      for (const card of request.opponentCards) hardExclude.add(card.wordId)
    }
    const words = selectDraftOptions({
      pool: request.pool,
      slots: request.slots,
      hardExclude,
      penalties,
      packPenalties,
      avoidStems,
      random,
    })
    if (words.length > best.length) best = words
    if (best.length >= request.slots.length) break
  }
  return best
}

/** Records offered cards: one draft counter step per draft or replacement. */
export function recordOffers(
  ctx: RoomContext,
  wordIds: readonly string[],
): void {
  const memory = ctx.state.wordMemory
  const draftCounter = memory.draftCounter + 1
  const offeredAt = { ...memory.offeredAt }
  for (const wordId of wordIds) offeredAt[wordId] = draftCounter
  ctx.state = {
    ...ctx.state,
    wordMemory: { ...memory, draftCounter, offeredAt },
  }
}

/** Appends chosen words to the used list and their packs to recent packs. */
export function recordChosenWords(
  ctx: RoomContext,
  chosen: readonly DraftOption[],
): void {
  const memory = ctx.state.wordMemory
  const usedWordIds = [
    ...memory.usedWordIds,
    ...chosen.map((card) => card.wordId),
  ].slice(-USED_WORDS_CAP)
  const recentPackIds = [
    ...[...chosen].reverse().map((card) => card.packId),
    ...memory.recentPackIds,
  ].slice(0, RECENT_PACKS_CAP)
  ctx.state = {
    ...ctx.state,
    wordMemory: { ...memory, usedWordIds, recentPackIds },
  }
}
