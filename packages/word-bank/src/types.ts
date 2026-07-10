export const WORD_DIFFICULTIES = ['easy', 'medium', 'hard'] as const

export type WordDifficulty = (typeof WORD_DIFFICULTIES)[number]

export const WORD_BANK_CONTRACT_VERSION = 1 as const

export interface WordBankGenerationRequest {
  readonly topic: string
  readonly count: number
  readonly locale: string
  readonly allowedDifficulties: readonly WordDifficulty[]
  readonly excludeTerms: readonly string[]
  readonly seed: string
}

export interface WordCandidate {
  /** Trimmed display form safe to render as plain text. */
  readonly text: string
  /** Unicode-normalized, case-folded form used for matching and deduplication. */
  readonly normalizedText: string
  readonly difficulty: WordDifficulty
  readonly tags: readonly string[]
}

export type GeneratorSource = 'curated' | 'model-generated'

export interface GeneratorIdentity {
  /** Domain-owned adapter identifier, not a vendor enum. */
  readonly id: string
  readonly version: string
  /** Prompt, catalog, or other adapter configuration version. */
  readonly configurationVersion?: string
}

export interface ModelIdentity {
  /** Opaque model name supplied by an adapter. */
  readonly id: string
  readonly revision?: string
}

/**
 * Provider-neutral lineage. A model-backed adapter supplies `model`; the local
 * curated generator does not pretend to have one.
 */
export interface GeneratorMetadata {
  readonly source: GeneratorSource
  readonly generator: GeneratorIdentity
  readonly model?: ModelIdentity
  readonly traceId?: string
  readonly generatedAt?: string
}

export type WordBankRoute = 'primary' | 'fallback' | 'local-only'

export type FallbackReason =
  'primary-error' | 'primary-timeout' | 'primary-invalid-output'

export interface WordBankProvenance extends GeneratorMetadata {
  readonly contractVersion: typeof WORD_BANK_CONTRACT_VERSION
  readonly route: WordBankRoute
  readonly fallbackReason?: FallbackReason
}

export interface WordBank {
  readonly topic: string
  readonly locale: string
  readonly candidates: readonly WordCandidate[]
  readonly provenance: WordBankProvenance
}

export interface WordBankGenerationContext {
  readonly signal: AbortSignal
}

/**
 * Domain-owned port. Implementations may call any future provider, but their
 * response stays `unknown` until this package validates it at runtime.
 */
export interface WordBankGenerator {
  generate(
    request: WordBankGenerationRequest,
    context: WordBankGenerationContext,
  ): Promise<unknown>
}

/** Convenience shape for adapter authors; the boundary still treats it as unknown. */
export interface WordBankGeneratorEnvelope {
  readonly payload: unknown
  readonly metadata: unknown
}

export type ValidationIssueCode =
  | 'request.invalid'
  | 'response.invalid'
  | 'metadata.invalid'
  | 'candidate.invalid'
  | 'candidate.duplicate'
  | 'candidate.excluded'
  | 'candidate.blocked'
  | 'candidate.unsupported-difficulty'
  | 'candidates.insufficient'
  | 'generator.error'
  | 'generator.timeout'

export interface ValidationIssue {
  readonly code: ValidationIssueCode
  readonly path: string
  readonly message: string
}

export type ValidationResult<T> =
  | {
      readonly ok: true
      readonly value: T
      /** Non-blocking issues, such as invalid extra candidates that were dropped. */
      readonly issues: readonly ValidationIssue[]
    }
  | {
      readonly ok: false
      readonly issues: readonly ValidationIssue[]
    }

export interface WordBankValidationPolicy {
  /** Exact normalized terms that may never enter a bank. */
  readonly blockedTerms: readonly string[]
  readonly maxCandidateCharacters: number
  readonly maxWordsPerCandidate: number
  readonly maxTagsPerCandidate: number
  readonly maxRawCandidates: number
}

export interface WordBankGenerationOptions {
  readonly generator?: WordBankGenerator
  readonly fallbackGenerator?: WordBankGenerator
  readonly validationPolicy?: Partial<WordBankValidationPolicy>
  readonly timeoutMs?: number
}

export type WordBankGenerationResult =
  | {
      readonly ok: true
      readonly bank: WordBank
      readonly issues: readonly ValidationIssue[]
    }
  | {
      readonly ok: false
      readonly code: 'invalid-request' | 'fallback-unavailable'
      readonly issues: readonly ValidationIssue[]
    }

export interface ValidatedGeneratorOutput {
  readonly candidates: readonly WordCandidate[]
  readonly metadata: GeneratorMetadata
}
