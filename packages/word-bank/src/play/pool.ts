import { CURATED_PACKS } from '../packs'
import { CUSTOM_PACK_ID } from '../packs/meta'
import type { WordDifficulty } from '../types'
import type { PlayableWord, WordPackData, WordPoolOptions } from './types'

/** URL/id-safe slug: lowercase ascii letters, digits, and single hyphens. */
export function slugifyTerm(term: string): string {
  return term
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function playableWordsForPack(pack: WordPackData): PlayableWord[] {
  return pack.words.map((entry) => ({
    id: `${pack.id}/${slugifyTerm(entry.term)}`,
    term: entry.term,
    difficulty: entry.difficulty,
    packId: pack.id,
    definition: entry.definition,
    aliases: entry.aliases ?? [],
  }))
}

let cachedAllWords: readonly PlayableWord[] | null = null
let cachedById: ReadonlyMap<string, PlayableWord> | null = null

/** Every curated word across every pack, in pack display order. */
export function getAllPlayableWords(): readonly PlayableWord[] {
  if (cachedAllWords === null) {
    cachedAllWords = Object.freeze(CURATED_PACKS.flatMap(playableWordsForPack))
  }
  return cachedAllWords
}

export function getPlayableWordById(id: string): PlayableWord | undefined {
  if (cachedById === null) {
    cachedById = new Map(getAllPlayableWords().map((word) => [word.id, word]))
  }
  return cachedById.get(id)
}

export function getPackWordCount(packId: string): number {
  return getAllPlayableWords().filter((word) => word.packId === packId).length
}

/**
 * Host custom words become medium-difficulty playable words in the `custom`
 * pack. Ids are deterministic so room memory recognizes repeats.
 */
export function customPlayableWords(
  customWords: readonly string[],
  difficulty: WordDifficulty = 'medium',
): PlayableWord[] {
  const seen = new Set<string>()
  const words: PlayableWord[] = []
  for (const raw of customWords) {
    const term = raw.trim().replace(/\s+/g, ' ')
    const slug = slugifyTerm(term)
    if (term.length === 0 || slug.length === 0 || seen.has(slug)) continue
    seen.add(slug)
    words.push({
      id: `${CUSTOM_PACK_ID}/${slug}`,
      term,
      difficulty,
      packId: CUSTOM_PACK_ID,
      definition: 'A custom word added by the host.',
      aliases: [],
    })
  }
  return words
}

/** The playable pool for a room's settings. Never empty if any pack exists. */
export function buildWordPool(options: WordPoolOptions): PlayableWord[] {
  const custom = customPlayableWords(options.customWords)
  if (options.customWordsMode === 'only' && custom.length > 0) return custom

  const enabled = new Set(options.packIds)
  const curated = getAllPlayableWords().filter((word) =>
    enabled.has(word.packId),
  )
  const pool = [...curated, ...custom]
  return pool.length > 0 ? pool : [...getAllPlayableWords()]
}
