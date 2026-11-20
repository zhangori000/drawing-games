import {
  answerKeyForWordId,
  buildWordPool,
  countFreshWords,
  CUSTOM_PACK_ID,
  getPlayableWordById,
  getWordPackName,
  normalizeAnswer,
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

const CUSTOM_COUNT_CACHE = new WeakMap<readonly string[], number>()

/**
 * Custom words that survive the word engine's own normalization. Memoized
 * per (immutable) list, since every viewer's projection asks for it.
 */
export function countCustomWords(customWords: readonly string[]): number {
  const cached = CUSTOM_COUNT_CACHE.get(customWords)
  if (cached !== undefined) return cached
  const count = buildWordPool({
    packIds: [],
    customWords,
    customWordsMode: 'only',
  }).filter((word) => word.packId === CUSTOM_PACK_ID).length
  CUSTOM_COUNT_CACHE.set(customWords, count)
  return count
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

/**
 * Most distinct cards one round can deal: both drafts plus every swap.
 * While a room has at least this many never-drawn words, no draft card is
 * ever a word already drawn in the room.
 */
export function roundWordDemand(settings: RoomSettings): number {
  return 2 * (settings.wordChoiceCount + settings.replacementsPerDrawer)
}

interface PoolKeys {
  readonly byId: ReadonlyMap<string, string>
  readonly keys: ReadonlySet<string>
}

const POOL_KEYS_CACHE = new WeakMap<readonly PlayableWord[], PoolKeys>()

function poolKeys(pool: readonly PlayableWord[]): PoolKeys {
  const cached = POOL_KEYS_CACHE.get(pool)
  if (cached !== undefined) return cached
  const byId = new Map(
    pool.map((word) => [word.id, normalizeAnswer(word.term)]),
  )
  const result = { byId, keys: new Set(byId.values()) }
  POOL_KEYS_CACHE.set(pool, result)
  return result
}

type MemoryCache<T> = WeakMap<
  readonly string[],
  WeakMap<readonly PlayableWord[], T>
>

const USED_KEYS_CACHE: MemoryCache<ReadonlySet<string>> = new WeakMap()
const UNUSED_COUNT_CACHE: MemoryCache<number> = new WeakMap()

/**
 * Per (immutable) used list and pool: every viewer's projection asks the
 * same question about the same state.
 */
function memoByMemory<T>(
  cache: MemoryCache<T>,
  pool: readonly PlayableWord[],
  usedWordIds: readonly string[],
  compute: () => T,
): T {
  let byPool = cache.get(usedWordIds)
  if (byPool === undefined) {
    byPool = new WeakMap()
    cache.set(usedWordIds, byPool)
  }
  if (byPool.has(pool)) return byPool.get(pool) as T
  const value = compute()
  byPool.set(pool, value)
  return value
}

/**
 * Room-used ids that still name a word in the pool (by id or answer key, so
 * `custom/cat` counts for `animals/cat`), once each, least recently drawn
 * first.
 */
function usedInPoolOldestFirst(
  pool: readonly PlayableWord[],
  usedWordIds: readonly string[],
): string[] {
  const { byId, keys } = poolKeys(pool)
  const newestFirst: string[] = []
  const seenIds = new Set<string>()
  const seenKeys = new Set<string>()
  for (let index = usedWordIds.length - 1; index >= 0; index -= 1) {
    const id = usedWordIds[index] as string
    if (seenIds.has(id)) continue
    seenIds.add(id)
    const key = byId.get(id) ?? answerKeyForWordId(id)
    if (key === null || key === undefined || !keys.has(key)) continue
    if (seenKeys.has(key)) continue
    seenKeys.add(key)
    newestFirst.push(id)
  }
  return newestFirst.reverse()
}

/** Answer keys of every pool word already drawn in this room. */
export function roomUsedKeys(
  pool: readonly PlayableWord[],
  usedWordIds: readonly string[],
): ReadonlySet<string> {
  return memoByMemory(USED_KEYS_CACHE, pool, usedWordIds, () => {
    const { byId } = poolKeys(pool)
    return new Set(
      usedInPoolOldestFirst(pool, usedWordIds).map(
        (id) => byId.get(id) ?? answerKeyForWordId(id) ?? id,
      ),
    )
  })
}

/** Whether a card is a word already drawn in this room. */
export function drawnInRoom(
  usedKeys: ReadonlySet<string>,
  card: { readonly term: string },
): boolean {
  return usedKeys.has(normalizeAnswer(card.term))
}

/** Pool words never drawn in this room (the lobby's no-repeat budget). */
export function unusedWordCount(
  pool: readonly PlayableWord[],
  usedWordIds: readonly string[],
): number {
  return memoByMemory(UNUSED_COUNT_CACHE, pool, usedWordIds, () =>
    countFreshWords(pool, new Set(usedWordIds)),
  )
}

/**
 * The first round of a `rounds`-round match whose cards could include a word
 * already drawn in this room, or null when every round stays fresh. Assumes
 * each round draws two never-drawn words and may deal `roundWordDemand`
 * distinct cards.
 */
export function firstRepeatRound(
  settings: RoomSettings,
  unused: number,
): number | null {
  const demand = roundWordDemand(settings)
  for (let round = 1; round <= settings.rounds; round += 1) {
    if (unused - 2 * (round - 1) < demand) return round
  }
  return null
}

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

/**
 * Picks draft cards for one drawer, following the layered word memory.
 *
 * Slots are filled in stages, each stage only for the slots the stricter
 * ones before it could not fill:
 *
 * 1. words never drawn in this room and not in the drawer's avoid memory;
 * 2. words never drawn in this room that the drawer has seen elsewhere;
 * 3. words drawn in this room, least recently drawn first (avoid memory
 *    still excluded), only as many of the oldest as the slots need;
 * 4. any word but the other team's cards;
 * 5. (tiny pools) the other team's cards too.
 *
 * So a drawn word only comes back once the pool has no never-drawn word
 * left for that slot, and then the oldest one does. The drawer's own live
 * cards and words replaced this round are never offered.
 */
export function selectDraftWords(
  request: DraftRequest,
  random: () => number,
): PlayableWord[] {
  const { pool, slots, drawer } = request
  const penalties = draftPenalties(request)
  const packPenalties = recentPackPenalties(request.wordMemory)
  const baseStems = [
    ...request.ownCards.flatMap((card) => wordStems(card.term)),
    ...request.opponentCards.flatMap((card) => wordStems(card.term)),
    ...lastDrawnStems(pool, request.wordMemory),
  ]
  const base = [
    ...request.ownCards.map((card) => card.wordId),
    ...request.replacedWordIds,
  ]
  const opponent = request.opponentCards.map((card) => card.wordId)
  const avoid = drawer.memory.avoid
  const used = usedInPoolOldestFirst(pool, request.wordMemory.usedWordIds)

  const chosen: PlayableWord[] = []
  /** Fills the still-open slots from words outside `excluded`. */
  const fill = (excluded: readonly (readonly string[])[]): boolean => {
    const open = slots.slice(chosen.length)
    if (open.length === 0) return true
    const picks = selectDraftOptions({
      pool,
      slots: open,
      hardExclude: new Set([
        ...excluded.flat(),
        ...chosen.map((word) => word.id),
      ]),
      penalties,
      packPenalties,
      avoidStems: new Set([
        ...baseStems,
        ...chosen.flatMap((word) => wordStems(word.term)),
      ]),
      random,
    })
    chosen.push(...picks)
    return chosen.length >= slots.length
  }

  if (fill([base, opponent, avoid, used])) return chosen
  if (fill([base, opponent, used])) return chosen
  // Bring back the least recently drawn words, a few at a time.
  const step = slots.length - chosen.length
  for (let allowed = step; allowed < used.length; allowed += step) {
    if (fill([base, opponent, avoid, used.slice(allowed)])) return chosen
  }
  if (fill([base, opponent, avoid])) return chosen
  if (fill([base, opponent])) return chosen
  fill([base])
  return chosen
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
