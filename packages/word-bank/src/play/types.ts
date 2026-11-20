import type { WordDifficulty } from '../types'

/** A word that can appear as a live draft card. Ids are stable forever. */
export interface PlayableWord {
  /** `${packId}/${slug}`, e.g. `animals/hermit-crab`. Never reused. */
  readonly id: string
  /** Display form, lowercase unless a proper noun is unavoidable. */
  readonly term: string
  readonly difficulty: WordDifficulty
  readonly packId: string
  /**
   * One plain sentence (≤140 chars) shown only to the drawer on request.
   * Null for host custom words, which have none.
   */
  readonly definition: string | null
  /** Extra accepted answers, e.g. `bike` for `bicycle`. */
  readonly aliases: readonly string[]
  /**
   * A host custom word without a difficulty tag: scored as `difficulty`
   * (medium) but labelled "Custom" for the drawer, not as a rated word.
   */
  readonly unrated?: true
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

/** A word as the guess matcher sees it; `PlayableWord` satisfies it. */
export interface GuessMatchWord {
  readonly term: string
  readonly aliases?: readonly string[]
}

export interface GuessMatchTarget extends GuessMatchWord {
  /**
   * The words in play, normally the room's whole pool (the target may be in
   * it). A verb-form spelling is never accepted when it names a different
   * one of them (`wave` is not `waving` while both are playable). Defaults
   * to the whole curated catalog. Keys are memoized per array instance, so
   * pass the same (immutable) pool each time.
   */
  readonly otherWords?: readonly GuessMatchWord[]
}
