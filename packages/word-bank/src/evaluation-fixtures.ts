import type {
  WordBank,
  WordBankGenerationRequest,
  WordDifficulty,
} from './types'
import { WORD_DIFFICULTIES } from './types'
import { normalizeForLookup } from './validation'

export interface WordBankEvaluationFixture {
  readonly id: string
  readonly description: string
  readonly request: Pick<WordBankGenerationRequest, 'topic' | 'count'> &
    Partial<Omit<WordBankGenerationRequest, 'topic' | 'count'>>
  readonly expected: {
    readonly requiredTags?: readonly string[]
    readonly forbiddenTerms?: readonly string[]
  }
  /** Dimensions that still require calibrated human or model-assisted review. */
  readonly reviewCriteria: readonly string[]
}

export interface WordBankEvaluationCheck {
  readonly id: string
  readonly passed: boolean
  readonly detail: string
}

export interface WordBankEvaluationReport {
  readonly fixtureId: string
  readonly passed: boolean
  readonly checks: readonly WordBankEvaluationCheck[]
  readonly reviewCriteria: readonly string[]
}

const COMMON_REVIEW_CRITERIA = Object.freeze([
  'topic relevance',
  'drawability without written words',
  'difficulty calibration',
  'cultural and age appropriateness',
  'variety without near-duplicates',
])

/**
 * Version-controlled examples for every future adapter. Exact checks are
 * automated; the review criteria prevent a schema-valid bank from being
 * mistaken for a fun or safe bank.
 */
export const WORD_BANK_EVALUATION_FIXTURES: readonly WordBankEvaluationFixture[] =
  Object.freeze([
    {
      id: 'animals-mixed-en',
      description: 'Common animal prompts across the supported difficulty set',
      request: {
        topic: 'animals',
        count: 6,
        locale: 'en-US',
        excludeTerms: ['cat'],
        seed: 'animals-mixed-v1',
      },
      expected: {
        requiredTags: ['animals'],
        forbiddenTerms: ['cat'],
      },
      reviewCriteria: COMMON_REVIEW_CRITERIA,
    },
    {
      id: 'space-hard-en',
      description: 'Hard but drawable space prompts',
      request: {
        topic: 'space',
        count: 4,
        locale: 'en-US',
        allowedDifficulties: ['hard'],
        seed: 'space-hard-v1',
      },
      expected: { requiredTags: ['space'] },
      reviewCriteria: COMMON_REVIEW_CRITERIA,
    },
    {
      id: 'food-easy-with-exclusion-en',
      description: 'Easy food prompts that honor a Seen exclusion',
      request: {
        topic: 'food',
        count: 4,
        locale: 'en-US',
        allowedDifficulties: ['easy'],
        excludeTerms: ['pizza'],
        seed: 'food-easy-v1',
      },
      expected: {
        requiredTags: ['food'],
        forbiddenTerms: ['pizza'],
      },
      reviewCriteria: COMMON_REVIEW_CRITERIA,
    },
    {
      id: 'unknown-topic-fallback-en',
      description: 'An unknown topic still yields a playable general bank',
      request: {
        topic: 'rainy day activities',
        count: 5,
        locale: 'en-US',
        seed: 'unknown-topic-v1',
      },
      expected: { requiredTags: ['general'] },
      reviewCriteria: COMMON_REVIEW_CRITERIA,
    },
  ])

export function evaluateWordBankFixture(
  bank: WordBank,
  fixture: WordBankEvaluationFixture,
): WordBankEvaluationReport {
  const locale = fixture.request.locale ?? 'en-US'
  const allowed = new Set<WordDifficulty>(
    fixture.request.allowedDifficulties ?? WORD_DIFFICULTIES,
  )
  const forbidden = new Set(
    [
      ...(fixture.request.excludeTerms ?? []),
      ...(fixture.expected.forbiddenTerms ?? []),
    ].map((term) => normalizeForLookup(term, locale)),
  )
  const requiredTags = (fixture.expected.requiredTags ?? []).map((tag) =>
    normalizeForLookup(tag, locale),
  )
  const normalized = bank.candidates.map((candidate) =>
    normalizeForLookup(candidate.text, locale),
  )

  const checks: WordBankEvaluationCheck[] = [
    {
      id: 'candidate-count',
      passed: bank.candidates.length === fixture.request.count,
      detail: `Expected ${fixture.request.count}; received ${bank.candidates.length}`,
    },
    {
      id: 'unique-normalized-terms',
      passed: new Set(normalized).size === normalized.length,
      detail: 'Candidate terms must remain unique after normalization',
    },
    {
      id: 'allowed-difficulties',
      passed: bank.candidates.every((candidate) =>
        allowed.has(candidate.difficulty),
      ),
      detail: 'Every difficulty must be allowed by the request',
    },
    {
      id: 'forbidden-terms',
      passed: normalized.every((term) => !forbidden.has(term)),
      detail: 'Excluded and fixture-forbidden terms must be absent',
    },
    {
      id: 'required-tags',
      passed: bank.candidates.every((candidate) =>
        requiredTags.every((tag) => candidate.tags.includes(tag)),
      ),
      detail: 'Every candidate must carry the fixture-required tags',
    },
    {
      id: 'contract-version',
      passed: bank.provenance.contractVersion === 1,
      detail: 'Provenance must identify the validated contract version',
    },
  ]

  return {
    fixtureId: fixture.id,
    passed: checks.every((check) => check.passed),
    checks,
    reviewCriteria: fixture.reviewCriteria,
  }
}
