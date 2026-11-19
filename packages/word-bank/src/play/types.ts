import type { WordDifficulty } from '../types'

/** A word that can appear as a live draft card. Ids are stable forever. */
export interface PlayableWord {
  /** `${packId}/${slug}`, e.g. `animals/hermit-crab`. Never reused. */
  readonly id: string
  /** Display form, lowercase unless a proper noun is unavoidable. */
  readonly term: string
  readonly difficulty: WordDifficulty
  readonly packId: string
  /** One plain sentence (≤140 chars) shown only to the drawer on request. */
  readonly definition: string
  /** Extra accepted answers, e.g. `bike` for `bicycle`. */
  readonly aliases: readonly string[]
}

/** Authoring shape for a curated pack file. */
export interface WordPackEntry {
  readonly term: string
  readonly difficulty: WordDifficulty
  readonly definition: string
  readonly aliases?: readonly string[]
}

export interface WordPackData {
  readonly id: string
  readonly words: readonly WordPackEntry[]
}

/** Client-safe pack metadata (no words). */
export interface WordPackInfo {
  readonly id: string
  readonly name: string
  readonly description: string
  /** Enabled in a brand-new room. */
  readonly defaultEnabled: boolean
  /** Suitable for younger players: concrete, gentle vocabulary. */
  readonly kidFriendly: boolean
}

export interface WordPoolOptions {
  readonly packIds: readonly string[]
  readonly customWords: readonly string[]
  readonly customWordsMode: 'mix' | 'only'
}

export interface DraftSelectionInput {
  readonly pool: readonly PlayableWord[]
  /** One requested difficulty per card, in display order. */
  readonly slots: readonly WordDifficulty[]
  /** Ids that must never be returned (current cards, opponent cards, used). */
  readonly hardExclude: ReadonlySet<string>
  /**
   * Multipliers in (0, 1] applied to a word's base weight. Missing ids weigh
   * 1. Callers combine room and personal memory into this map.
   */
  readonly penalties: ReadonlyMap<string, number>
  /** Pack ids to de-prioritize (e.g. packs of the last few chosen words). */
  readonly packPenalties?: ReadonlyMap<string, number>
  /** Stems already in play this round; options must not share them. */
  readonly avoidStems: ReadonlySet<string>
  /** Uniform random source in [0, 1). Must be the caller's seeded PRNG. */
  readonly random: () => number
}

export type GuessMatchVerdict = 'correct' | 'close' | 'partial' | 'wrong'

export interface GuessMatchTarget {
  readonly term: string
  readonly aliases?: readonly string[]
}
