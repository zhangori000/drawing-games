import type {
  WordBankGenerationRequest,
  WordBankGenerator,
  WordBankGeneratorEnvelope,
  WordDifficulty,
} from './types.js'
import { normalizeForLookup } from './validation.js'

export interface CuratedWord {
  readonly text: string
  readonly difficulty: WordDifficulty
  readonly tags: readonly string[]
}

export const LOCAL_CATALOG_VERSION = '2026-07-10.1'

export const DEFAULT_CURATED_WORDS: readonly CuratedWord[] = Object.freeze([
  { text: 'sun', difficulty: 'easy', tags: ['general'] },
  { text: 'house', difficulty: 'easy', tags: ['general'] },
  { text: 'tree', difficulty: 'easy', tags: ['general'] },
  { text: 'bicycle', difficulty: 'easy', tags: ['general'] },
  { text: 'rainbow', difficulty: 'easy', tags: ['general'] },
  { text: 'lighthouse', difficulty: 'medium', tags: ['general'] },
  { text: 'skateboard', difficulty: 'medium', tags: ['general'] },
  { text: 'campfire', difficulty: 'medium', tags: ['general'] },
  { text: 'snowman', difficulty: 'medium', tags: ['general'] },
  { text: 'treasure map', difficulty: 'medium', tags: ['general'] },
  { text: 'time machine', difficulty: 'hard', tags: ['general'] },
  { text: 'traffic jam', difficulty: 'hard', tags: ['general'] },
  { text: 'optical illusion', difficulty: 'hard', tags: ['general'] },
  { text: 'chain reaction', difficulty: 'hard', tags: ['general'] },
  { text: 'escape artist', difficulty: 'hard', tags: ['general'] },

  { text: 'cat', difficulty: 'easy', tags: ['animals'] },
  { text: 'dog', difficulty: 'easy', tags: ['animals'] },
  { text: 'rabbit', difficulty: 'easy', tags: ['animals'] },
  { text: 'turtle', difficulty: 'easy', tags: ['animals'] },
  { text: 'butterfly', difficulty: 'easy', tags: ['animals'] },
  { text: 'octopus', difficulty: 'medium', tags: ['animals'] },
  { text: 'peacock', difficulty: 'medium', tags: ['animals'] },
  { text: 'kangaroo', difficulty: 'medium', tags: ['animals'] },
  { text: 'chameleon', difficulty: 'medium', tags: ['animals'] },
  { text: 'hedgehog', difficulty: 'medium', tags: ['animals'] },
  { text: 'platypus', difficulty: 'hard', tags: ['animals'] },
  { text: 'narwhal', difficulty: 'hard', tags: ['animals'] },
  { text: 'praying mantis', difficulty: 'hard', tags: ['animals'] },
  { text: 'emperor penguin', difficulty: 'hard', tags: ['animals'] },
  { text: 'hermit crab', difficulty: 'hard', tags: ['animals'] },

  { text: 'moon', difficulty: 'easy', tags: ['space'] },
  { text: 'rocket', difficulty: 'easy', tags: ['space'] },
  { text: 'planet', difficulty: 'easy', tags: ['space'] },
  { text: 'astronaut', difficulty: 'easy', tags: ['space'] },
  { text: 'alien', difficulty: 'easy', tags: ['space'] },
  { text: 'satellite', difficulty: 'medium', tags: ['space'] },
  { text: 'comet', difficulty: 'medium', tags: ['space'] },
  { text: 'space station', difficulty: 'medium', tags: ['space'] },
  { text: 'moon rover', difficulty: 'medium', tags: ['space'] },
  { text: 'asteroid belt', difficulty: 'medium', tags: ['space'] },
  { text: 'solar eclipse', difficulty: 'hard', tags: ['space'] },
  { text: 'black hole', difficulty: 'hard', tags: ['space'] },
  { text: 'zero gravity', difficulty: 'hard', tags: ['space'] },
  { text: 'lunar landing', difficulty: 'hard', tags: ['space'] },
  { text: 'spacewalk', difficulty: 'hard', tags: ['space'] },

  { text: 'pizza', difficulty: 'easy', tags: ['food'] },
  { text: 'taco', difficulty: 'easy', tags: ['food'] },
  { text: 'banana', difficulty: 'easy', tags: ['food'] },
  { text: 'cupcake', difficulty: 'easy', tags: ['food'] },
  { text: 'ice cream', difficulty: 'easy', tags: ['food'] },
  { text: 'spaghetti', difficulty: 'medium', tags: ['food'] },
  { text: 'sushi', difficulty: 'medium', tags: ['food'] },
  { text: 'waffle', difficulty: 'medium', tags: ['food'] },
  { text: 'food truck', difficulty: 'medium', tags: ['food'] },
  { text: 'picnic basket', difficulty: 'medium', tags: ['food'] },
  { text: 'chocolate fountain', difficulty: 'hard', tags: ['food'] },
  { text: 'breakfast in bed', difficulty: 'hard', tags: ['food'] },
  { text: 'gingerbread house', difficulty: 'hard', tags: ['food'] },
  { text: 'three-tier cake', difficulty: 'hard', tags: ['food'] },
  { text: 'cooking contest', difficulty: 'hard', tags: ['food'] },
])

/**
 * A zero-network generator that always orders the same curated catalog for the
 * same request. It is both the initial implementation and the failure fallback
 * for future model-backed adapters.
 */
export function createDeterministicFallbackGenerator(
  catalog: readonly CuratedWord[] = DEFAULT_CURATED_WORDS,
): WordBankGenerator {
  return {
    async generate(request): Promise<WordBankGeneratorEnvelope> {
      return {
        payload: {
          candidates: rankCatalog(catalog, request),
        },
        metadata: {
          source: 'curated',
          generator: {
            id: 'local-curated-word-bank',
            version: '1',
            configurationVersion: LOCAL_CATALOG_VERSION,
          },
        },
      }
    },
  }
}

function rankCatalog(
  catalog: readonly CuratedWord[],
  request: WordBankGenerationRequest,
): readonly CuratedWord[] {
  const topic = normalizeForLookup(request.topic, request.locale)
  const excluded = new Set(
    request.excludeTerms.map((term) =>
      normalizeForLookup(term, request.locale),
    ),
  )
  const difficulties = new Set(request.allowedDifficulties)

  return catalog
    .filter(
      (candidate) =>
        difficulties.has(candidate.difficulty) &&
        !excluded.has(normalizeForLookup(candidate.text, request.locale)),
    )
    .map((candidate) => ({
      candidate,
      topicRank: getTopicRank(candidate, topic, request.locale),
      stableRank: stableHash(
        `${request.seed}\u0000${topic}\u0000${normalizeForLookup(candidate.text, request.locale)}`,
      ),
    }))
    .sort(
      (left, right) =>
        left.topicRank - right.topicRank ||
        left.stableRank - right.stableRank ||
        left.candidate.text.localeCompare(right.candidate.text),
    )
    .map(({ candidate }) => candidate)
}

function getTopicRank(
  candidate: CuratedWord,
  requestedTopic: string,
  locale: string,
): number {
  const tags = candidate.tags.map((tag) => normalizeForLookup(tag, locale))
  if (tags.includes(requestedTopic)) return 0
  if (tags.includes('general')) return 1
  return 2
}

function stableHash(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}
