import { CURATED_PACKS } from '../packs'
import { CUSTOM_PACK_ID } from '../packs/meta'
import type { WordDifficulty } from '../types'
import { parseCustomWordEntry } from './custom-entry'
import { foldText, normalizeAnswer } from './text'
import type { PlayableWord, WordPackData, WordPoolOptions } from './types'

/** URL/id-safe slug: lowercase ascii letters, digits, and single hyphens. */
export function slugifyTerm(term: string): string {
  return foldText(term)
    .replace(/&/g, ' and ')
    .replace(/['’‘`ʼ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** FNV-1a, base36: a short stable suffix for slugs that lose letters. */
function stableHash(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(36)
}

/**
 * Marks a hashed custom slug. `slugifyTerm` never emits a double hyphen, so
 * hashed slugs cannot collide with plain ones.
 */
const HASHED_SLUG_SEPARATOR = '--'

/**
 * Slug for a host word. When the ascii slug drops letters (non-Latin
 * scripts), a hash of the full answer key keeps distinct words distinct.
 */
function customSlug(term: string, answerKey: string): string {
  const slug = slugifyTerm(term)
  if (slug.length > 0 && normalizeAnswer(slug) === answerKey) return slug
  const base = slug.length > 0 ? slug : 'u'
  return `${base}${HASHED_SLUG_SEPARATOR}${stableHash(answerKey)}`
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

/**
 * Curated words that moved to another pack, by their old id. Ids are
 * stable forever, so memories and histories that still hold an old id (an
 * account's never-again list, a guest's seen words, a room's drawn words)
 * keep naming the same word: `answerKeyForWordId`, `getPlayableWordById`,
 * and `canonicalWordId` resolve them.
 */
export const LEGACY_WORD_IDS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries([
    ...[
      'brain',
      'skeleton',
      'muscle',
      'eye',
      'ear',
      'nose',
      'tooth',
      'tongue',
      'bone',
      'hand',
      'foot',
      'lungs',
      'fingerprint',
      'belly-button',
      'sunburn',
      'freckles',
      'brain-freeze',
      'goosebumps',
      'heartbeat',
    ].map((slug) => [`space-science/${slug}`, `body-health/${slug}`]),
    ['space-science/elevator', 'places/elevator'],
    ['space-science/escalator', 'places/escalator'],
  ] as const),
)

/** The current id of a word id (itself unless the word moved packs). */
export function canonicalWordId(id: string): string {
  return LEGACY_WORD_IDS[id] ?? id
}

interface CuratedIndex {
  readonly words: readonly PlayableWord[]
  readonly byId: ReadonlyMap<string, PlayableWord>
  readonly answerKeyById: ReadonlyMap<string, string>
  readonly countByPack: ReadonlyMap<string, number>
}

let curatedIndex: CuratedIndex | null = null

function getCuratedIndex(): CuratedIndex {
  if (curatedIndex === null) {
    const words = Object.freeze(CURATED_PACKS.flatMap(playableWordsForPack))
    const countByPack = new Map<string, number>()
    for (const word of words) {
      countByPack.set(word.packId, (countByPack.get(word.packId) ?? 0) + 1)
    }
    curatedIndex = {
      words,
      byId: new Map(words.map((word) => [word.id, word])),
      answerKeyById: new Map(
        words.map((word) => [word.id, normalizeAnswer(word.term)]),
      ),
      countByPack,
    }
  }
  return curatedIndex
}

/** Every curated word across every pack, in pack display order. */
export function getAllPlayableWords(): readonly PlayableWord[] {
  return getCuratedIndex().words
}

export function getPlayableWordById(id: string): PlayableWord | undefined {
  return getCuratedIndex().byId.get(canonicalWordId(id))
}

export function getPackWordCount(packId: string): number {
  return getCuratedIndex().countByPack.get(packId) ?? 0
}

/**
 * The answer key a word id stands for, even when the word is not in the
 * current pool: curated ids via the catalog, custom ids via their slug.
 * Lets room memory recognize `custom/cat` and `animals/cat` as one word.
 */
export function answerKeyForWordId(id: string): string | null {
  const curated = getCuratedIndex().answerKeyById.get(canonicalWordId(id))
  if (curated !== undefined) return curated
  const prefix = `${CUSTOM_PACK_ID}/`
  if (!id.startsWith(prefix)) return null
  const slug = id.slice(prefix.length)
  if (slug.length === 0 || slug.includes(HASHED_SLUG_SEPARATOR)) return null
  return normalizeAnswer(slug)
}

/** Answer key of a pool word, using the curated cache when possible. */
function answerKeyOf(word: PlayableWord): string {
  return (
    getCuratedIndex().answerKeyById.get(word.id) ?? normalizeAnswer(word.term)
  )
}

/** Trimmed, control-free, whitespace-collapsed display form. */
function cleanCustomTerm(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Host custom words become playable words in the `custom` pack with ids
 * `custom/<slug>`, so room memory recognizes repeats. Words that share a slug
 * or an answer key (`ice cream`, `Ice-Cream`, `icecream`) are kept once, in
 * first-seen order; words with no letters or digits, and entries with a
 * malformed difficulty tag, are dropped. A tagged entry (`kite|hard`, see
 * `parseCustomWordEntry`) gets that difficulty; an untagged one gets
 * `untaggedDifficulty` and is marked `unrated`. The id comes from the term
 * alone, so re-tagging a word never makes it look new. Custom words have no
 * definition.
 */
export function customPlayableWords(
  customWords: readonly string[],
  untaggedDifficulty: WordDifficulty = 'medium',
): PlayableWord[] {
  const seenSlugs = new Set<string>()
  const seenKeys = new Set<string>()
  const words: PlayableWord[] = []
  for (const raw of customWords) {
    const entry = parseCustomWordEntry(raw)
    if (entry === null) continue
    const term = cleanCustomTerm(entry.term)
    const answerKey = normalizeAnswer(term)
    if (answerKey.length === 0 || seenKeys.has(answerKey)) continue
    const slug = customSlug(term, answerKey)
    if (seenSlugs.has(slug)) continue
    seenSlugs.add(slug)
    seenKeys.add(answerKey)
    words.push({
      id: `${CUSTOM_PACK_ID}/${slug}`,
      term,
      difficulty: entry.difficulty ?? untaggedDifficulty,
      packId: CUSTOM_PACK_ID,
      definition: null,
      aliases: [],
      ...(entry.difficulty === null ? { unrated: true as const } : {}),
    })
  }
  return words
}

/** Keeps the first word for each answer key (curated before custom). */
function dedupeByAnswerKey(words: readonly PlayableWord[]): PlayableWord[] {
  const seenIds = new Set<string>()
  const seenKeys = new Set<string>()
  return words.filter((word) => {
    const key = answerKeyOf(word)
    if (seenIds.has(word.id) || seenKeys.has(key)) return false
    seenIds.add(word.id)
    seenKeys.add(key)
    return true
  })
}

/**
 * The playable pool for a room's settings: enabled curated packs (unknown ids
 * ignored) plus custom words, or only custom words in `only` mode. A custom
 * word that repeats a curated term is dropped in favor of the curated entry,
 * which has a real definition and difficulty. Never empty while any curated
 * pack exists: an empty selection falls back to every curated word.
 */
export function buildWordPool(options: WordPoolOptions): PlayableWord[] {
  const custom = customPlayableWords(options.customWords)
  if (options.customWordsMode === 'only' && custom.length > 0) return custom

  const enabled = new Set(options.packIds)
  const curated = getAllPlayableWords().filter((word) =>
    enabled.has(word.packId),
  )
  const pool = dedupeByAnswerKey([...curated, ...custom])
  return pool.length > 0 ? pool : [...getAllPlayableWords()]
}
