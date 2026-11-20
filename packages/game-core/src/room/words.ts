import {
  buildWordPool,
  countFreshWords,
  CUSTOM_PACK_ID,
  getPlayableWordById,
  getWordPackName,
  normalizeAnswer,
  sameWordIndex,
  selectDraftSlots,
  termForWordId,
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
    ...(word.unrated === true ? { unrated: true } : {}),
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

const POOL_BY_ID_CACHE = new WeakMap<
  readonly PlayableWord[],
  ReadonlyMap<string, PlayableWord>
>()

/**
 * The pool word a (possibly older, or other-pack) word id names: itself, or
 * the pool word with the same answer key or inflection (`isSameWord`), so
 * room memory of `animals/dolphin` also covers a custom `dolphins`.
 */
export function poolWordFor(
  pool: readonly PlayableWord[],
  wordId: string,
): PlayableWord | undefined {
  let byId = POOL_BY_ID_CACHE.get(pool)
  if (byId === undefined) {
    byId = new Map(pool.map((word) => [word.id, word]))
    POOL_BY_ID_CACHE.set(pool, byId)
  }
  const own = byId.get(wordId)
  if (own !== undefined) return own
  const term = termForWordId(wordId)
  return term === null ? undefined : sameWordIndex(pool).find(term)
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
 * Room-used ids that still name a word in the pool (by id, answer key, or
 * inflection, so `custom/cat` counts for `animals/cat` and `animals/dolphin`
 * for a custom `dolphins`), once per pool word, least recently drawn first.
 */
function usedInPoolOldestFirst(
  pool: readonly PlayableWord[],
  usedWordIds: readonly string[],
): string[] {
  const newestFirst: string[] = []
  const seenIds = new Set<string>()
  const seenPoolIds = new Set<string>()
  for (let index = usedWordIds.length - 1; index >= 0; index -= 1) {
    const id = usedWordIds[index] as string
    if (seenIds.has(id)) continue
    seenIds.add(id)
    const word = poolWordFor(pool, id)
    if (word === undefined || seenPoolIds.has(word.id)) continue
    seenPoolIds.add(word.id)
    newestFirst.push(id)
  }
  return newestFirst.reverse()
}

/** Ids of the pool words never drawn in this room (by `poolWordFor`). */
function neverDrawnIds(
  pool: readonly PlayableWord[],
  usedWordIds: readonly string[],
): string[] {
  const drawn = new Set<string>()
  for (const id of usedWordIds) {
    const word = poolWordFor(pool, id)
    if (word !== undefined) drawn.add(word.id)
  }
  return pool.flatMap((word) => (drawn.has(word.id) ? [] : [word.id]))
}

/** Answer keys of every pool word already drawn in this room. */
export function roomUsedKeys(
  pool: readonly PlayableWord[],
  usedWordIds: readonly string[],
): ReadonlySet<string> {
  return memoByMemory(USED_KEYS_CACHE, pool, usedWordIds, () => {
    const keys = new Set<string>()
    for (const id of usedInPoolOldestFirst(pool, usedWordIds)) {
      const word = poolWordFor(pool, id)
      if (word !== undefined) keys.add(normalizeAnswer(word.term))
    }
    return keys
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

export interface DifficultyShortfall {
  readonly difficulty: WordDifficulty
  readonly fromRound: number
}

const FRESH_BY_DIFFICULTY_CACHE: MemoryCache<
  Readonly<Record<WordDifficulty, number>>
> = new WeakMap()

/** Never-drawn pool words of each difficulty. */
function freshByDifficulty(
  pool: readonly PlayableWord[],
  usedWordIds: readonly string[],
): Readonly<Record<WordDifficulty, number>> {
  return memoByMemory(FRESH_BY_DIFFICULTY_CACHE, pool, usedWordIds, () => {
    const fresh = new Set(neverDrawnIds(pool, usedWordIds))
    const counts: Record<WordDifficulty, number> = {
      easy: 0,
      medium: 0,
      hard: 0,
    }
    for (const word of pool) {
      if (fresh.has(word.id)) counts[word.difficulty] += 1
    }
    return counts
  })
}

/**
 * Balanced hands need `⌊cards / 3⌋` cards of every difficulty per team. The
 * first round of a `rounds`-round match from which some hand may lack a
 * difficulty, because the room's never-drawn words of it run short (the slot
 * then gets another difficulty, or a drawn word), or null. Like
 * `firstRepeatRound` it assumes the worst: both words drawn each round are of
 * that difficulty. Only for the balanced mix, whose slots are fixed.
 */
export function firstShortDifficulty(
  settings: RoomSettings,
  pool: readonly PlayableWord[],
  usedWordIds: readonly string[],
): DifficultyShortfall | null {
  const perHand = Math.floor(settings.wordChoiceCount / 3)
  if (settings.difficultyMix !== 'balanced' || perHand === 0) return null
  const supply = freshByDifficulty(pool, usedWordIds)
  let best: DifficultyShortfall | null = null
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    for (let round = 1; round <= settings.rounds; round += 1) {
      if (supply[difficulty] - 2 * (round - 1) < 2 * perHand) {
        if (best === null || round < best.fromRound) {
          best = { difficulty, fromRound: round }
        }
        break
      }
    }
  }
  return best
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
  /**
   * Whether a tiny pool may fall back to the other team's cards (stage 5).
   * Only a fresh deal may: a swap that handed the drawer an opponent card
   * (possibly the opponent's locked answer) would leak it, so swaps pass
   * false and are refused when nothing else is left.
   */
  readonly allowOpponentCards?: boolean
  /**
   * At most this many cards from words never drawn in the room (stages 1
   * and 2), so the hand dealt first leaves the other its share of a short
   * supply (`freshShareFor`). Unlimited when absent.
   */
  readonly maxFreshCards?: number
}

/**
 * How many never-drawn words the hand dealt first (team A) may take, so a
 * short supply is shared between both hands instead of A taking it all:
 * unlimited while there are enough for both full hands, else half, the odd
 * one going to A in odd rounds and to B in even rounds.
 */
export function freshShareFor(
  pool: readonly PlayableWord[],
  usedWordIds: readonly string[],
  cardsPerHand: number,
  roundNumber: number,
): number | undefined {
  const fresh = unusedWordCount(pool, usedWordIds)
  if (fresh >= 2 * cardsPerHand) return undefined
  return roundNumber % 2 === 1 ? Math.ceil(fresh / 2) : Math.floor(fresh / 2)
}

function draftPenalties(request: DraftRequest): Map<string, number> {
  const penalties = new Map<string, number>()
  // Memory may name a word by another id (`animals/dolphin` for a custom
  // `dolphins`): the penalty lands on the pool word it names.
  const multiply = (wordId: string, factor: number) => {
    const id = poolWordFor(request.pool, wordId)?.id ?? wordId
    penalties.set(id, (penalties.get(id) ?? 1) * factor)
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
 * 5. (tiny pools, fresh deals only) the other team's cards too.
 *
 * Within stages 1–3 a word first goes to a slot of its own difficulty, and
 * only then may fill a slot of another difficulty, so a scarce easy word
 * never takes the medium slot while the easy slot gets a drawn word (in
 * stage 3 a drawn word of the slot's difficulty comes back before an older
 * one of another difficulty).
 * Stages 1 and 2 together give at most `maxFreshCards` cards. So a drawn
 * word only comes back once the pool has no never-drawn word left for that
 * slot (or this hand's share of them is used), and then the oldest one
 * does. The drawer's own live cards and words replaced this round are
 * never offered.
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

  /** One entry per slot, in slot order; null while open. */
  const chosen: (PlayableWord | null)[] = slots.map(() => null)
  let freshLeft = request.maxFreshCards ?? Number.POSITIVE_INFINITY
  const picked = () => chosen.filter((word) => word !== null)
  /**
   * Fills still-open slots from words outside `excluded`: only with a word
   * of the slot's difficulty when `strict`, and counting against the
   * never-drawn share when `fresh`. True once every slot is filled.
   */
  const fill = (
    excluded: readonly (readonly string[])[],
    options: { readonly strict?: boolean; readonly fresh?: boolean } = {},
  ): boolean => {
    const open = slots.flatMap((_, index) =>
      chosen[index] === null ? [index] : [],
    )
    if (open.length === 0) return true
    if (options.fresh === true && freshLeft <= 0) return false
    const taken = picked()
    const words = selectDraftSlots({
      pool,
      slots: open.map((index) => slots[index] as WordDifficulty),
      hardExclude: new Set([
        ...excluded.flat(),
        ...taken.map((word) => word.id),
      ]),
      penalties,
      packPenalties,
      avoidStems: new Set([
        ...baseStems,
        ...taken.flatMap((word) => wordStems(word.term)),
      ]),
      random,
      strictDifficulty: options.strict === true,
      ...(options.fresh === true && Number.isFinite(freshLeft)
        ? { maxPicks: freshLeft }
        : {}),
    })
    words.forEach((word, at) => {
      if (word === null) return
      chosen[open[at] as number] = word
      if (options.fresh === true) freshLeft -= 1
    })
    return chosen.every((word) => word !== null)
  }
  /** Own difficulty first, then any (see above). */
  const fillBoth = (
    excluded: readonly (readonly string[])[],
    fresh = false,
  ): boolean =>
    fill(excluded, { strict: true, fresh }) || fill(excluded, { fresh })

  const done = () => picked()
  if (fillBoth([base, opponent, avoid, used], true)) return done()
  if (fillBoth([base, opponent, used], true)) return done()
  // This hand's share of never-drawn words is used: the rest stay for the
  // other hand while drawn words can fill the slots.
  const reserved =
    request.maxFreshCards === undefined
      ? []
      : neverDrawnIds(pool, request.wordMemory.usedWordIds)
  // Bring back the least recently drawn words, a few at a time: first only
  // into slots of their own difficulty, then into any.
  const step = slots.length - picked().length
  for (const strict of [true, false]) {
    for (let allowed = step; allowed < used.length; allowed += step) {
      const stage = [base, opponent, avoid, used.slice(allowed), reserved]
      if (fill(stage, { strict })) return done()
    }
    const anyDrawn = [base, opponent, avoid, reserved]
    if (reserved.length > 0 && fill(anyDrawn, { strict })) return done()
  }
  if (fill([base, opponent, avoid])) return done()
  if (fill([base, opponent])) return done()
  if (request.allowOpponentCards !== false) fill([base])
  return done()
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
