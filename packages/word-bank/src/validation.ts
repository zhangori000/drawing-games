import {
  WORD_DIFFICULTIES,
  type GeneratorMetadata,
  type ValidationIssue,
  type ValidationResult,
  type ValidatedGeneratorOutput,
  type WordBankGenerationRequest,
  type WordBankValidationPolicy,
  type WordCandidate,
  type WordDifficulty,
} from './types'

export const DEFAULT_WORD_BANK_VALIDATION_POLICY: WordBankValidationPolicy =
  Object.freeze({
    blockedTerms: Object.freeze([]),
    maxCandidateCharacters: 64,
    maxWordsPerCandidate: 5,
    maxTagsPerCandidate: 8,
    maxRawCandidates: 128,
  })

const MAX_TOPIC_CHARACTERS = 80
const MAX_REQUESTED_CANDIDATES = 64
const MAX_EXCLUDED_TERMS = 128
const MAX_ID_CHARACTERS = 128
const MAX_VERSION_CHARACTERS = 64
const MAX_TAG_CHARACTERS = 32
const DISALLOWED_PLAIN_TEXT = /[\u0000-\u001f\u007f<>]/u
const SIMPLE_ID = /^[A-Za-z0-9._:/-]+$/u

export function parseWordBankGenerationRequest(
  input: unknown,
): ValidationResult<WordBankGenerationRequest> {
  const issues: ValidationIssue[] = []

  if (!isRecord(input)) {
    return failure('request.invalid', '$', 'Request must be an object')
  }

  const topic = parsePlainText(
    input.topic,
    'topic',
    MAX_TOPIC_CHARACTERS,
    issues,
    'request.invalid',
  )

  const count =
    typeof input.count === 'number' &&
    Number.isInteger(input.count) &&
    input.count >= 1 &&
    input.count <= MAX_REQUESTED_CANDIDATES
      ? input.count
      : null

  if (count === null) {
    issues.push({
      code: 'request.invalid',
      path: 'count',
      message: `Count must be an integer from 1 to ${MAX_REQUESTED_CANDIDATES}`,
    })
  }

  const locale = parseLocale(input.locale, issues)
  const allowedDifficulties = parseDifficulties(
    input.allowedDifficulties,
    issues,
  )
  const excludeTerms = parseExcludeTerms(input.excludeTerms, locale, issues)

  const rawSeed = input.seed
  let seed: string | null = null
  if (rawSeed === undefined) {
    if (topic !== null && locale !== null) seed = `${topic}|${locale}`
  } else {
    seed = parsePlainText(
      rawSeed,
      'seed',
      MAX_ID_CHARACTERS,
      issues,
      'request.invalid',
    )
  }

  if (
    issues.length > 0 ||
    topic === null ||
    count === null ||
    locale === null ||
    allowedDifficulties === null ||
    excludeTerms === null ||
    seed === null
  ) {
    return { ok: false, issues }
  }

  return {
    ok: true,
    value: {
      topic,
      count,
      locale,
      allowedDifficulties,
      excludeTerms,
      seed,
    },
    issues: [],
  }
}

export function mergeWordBankValidationPolicy(
  policy: Partial<WordBankValidationPolicy> | undefined,
): WordBankValidationPolicy {
  return {
    blockedTerms: Array.isArray(policy?.blockedTerms)
      ? policy.blockedTerms.filter(
          (term): term is string => typeof term === 'string',
        )
      : DEFAULT_WORD_BANK_VALIDATION_POLICY.blockedTerms,
    maxCandidateCharacters: positiveIntegerOr(
      policy?.maxCandidateCharacters,
      DEFAULT_WORD_BANK_VALIDATION_POLICY.maxCandidateCharacters,
    ),
    maxWordsPerCandidate: positiveIntegerOr(
      policy?.maxWordsPerCandidate,
      DEFAULT_WORD_BANK_VALIDATION_POLICY.maxWordsPerCandidate,
    ),
    maxTagsPerCandidate: positiveIntegerOr(
      policy?.maxTagsPerCandidate,
      DEFAULT_WORD_BANK_VALIDATION_POLICY.maxTagsPerCandidate,
    ),
    maxRawCandidates: positiveIntegerOr(
      policy?.maxRawCandidates,
      DEFAULT_WORD_BANK_VALIDATION_POLICY.maxRawCandidates,
    ),
  }
}

export function validateGeneratorOutput(
  input: unknown,
  request: WordBankGenerationRequest,
  policy: WordBankValidationPolicy,
): ValidationResult<ValidatedGeneratorOutput> {
  if (!isRecord(input)) {
    return failure(
      'response.invalid',
      '$',
      'Generator response must be an envelope object',
    )
  }

  const metadataResult = parseGeneratorMetadata(input.metadata)
  const candidateResult = validateCandidatePayload(
    input.payload,
    request,
    policy,
  )
  const issues = [...metadataResult.issues, ...candidateResult.issues]

  if (!metadataResult.ok || !candidateResult.ok) {
    return { ok: false, issues }
  }

  return {
    ok: true,
    value: {
      metadata: metadataResult.value,
      candidates: candidateResult.value,
    },
    issues,
  }
}

export function normalizeForLookup(value: string, locale = 'en-US'): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase(locale)
}

function validateCandidatePayload(
  input: unknown,
  request: WordBankGenerationRequest,
  policy: WordBankValidationPolicy,
): ValidationResult<readonly WordCandidate[]> {
  if (!isRecord(input) || !Array.isArray(input.candidates)) {
    return failure(
      'response.invalid',
      'payload.candidates',
      'Payload must contain a candidates array',
    )
  }

  const issues: ValidationIssue[] = []
  const candidates: WordCandidate[] = []
  const seen = new Set<string>()
  const excluded = new Set(
    request.excludeTerms.map((term) =>
      normalizeForLookup(term, request.locale),
    ),
  )
  const blocked = new Set(
    policy.blockedTerms.map((term) => normalizeForLookup(term, request.locale)),
  )
  const allowed = new Set<WordDifficulty>(request.allowedDifficulties)
  const rawCandidates = input.candidates.slice(0, policy.maxRawCandidates)

  if (input.candidates.length > policy.maxRawCandidates) {
    issues.push({
      code: 'response.invalid',
      path: 'payload.candidates',
      message: `Only the first ${policy.maxRawCandidates} candidates were inspected`,
    })
  }

  for (const [index, rawCandidate] of rawCandidates.entries()) {
    const path = `payload.candidates[${index}]`
    const parsed = parseCandidate(rawCandidate, path, request, policy, issues)
    if (parsed === null) continue

    if (excluded.has(parsed.normalizedText)) {
      issues.push({
        code: 'candidate.excluded',
        path: `${path}.text`,
        message: 'Candidate was excluded by the request',
      })
      continue
    }

    if (blocked.has(parsed.normalizedText)) {
      issues.push({
        code: 'candidate.blocked',
        path: `${path}.text`,
        message: 'Candidate was blocked by policy',
      })
      continue
    }

    if (!allowed.has(parsed.difficulty)) {
      issues.push({
        code: 'candidate.unsupported-difficulty',
        path: `${path}.difficulty`,
        message: 'Candidate difficulty was not requested',
      })
      continue
    }

    if (seen.has(parsed.normalizedText)) {
      issues.push({
        code: 'candidate.duplicate',
        path: `${path}.text`,
        message: 'Candidate duplicates an earlier normalized term',
      })
      continue
    }

    seen.add(parsed.normalizedText)
    candidates.push(parsed)
  }

  if (candidates.length < request.count) {
    issues.push({
      code: 'candidates.insufficient',
      path: 'payload.candidates',
      message: `Expected ${request.count} valid unique candidates but received ${candidates.length}`,
    })
    return { ok: false, issues }
  }

  return {
    ok: true,
    value: candidates.slice(0, request.count),
    issues,
  }
}

function parseCandidate(
  input: unknown,
  path: string,
  request: WordBankGenerationRequest,
  policy: WordBankValidationPolicy,
  issues: ValidationIssue[],
): WordCandidate | null {
  if (!isRecord(input)) {
    issues.push({
      code: 'candidate.invalid',
      path,
      message: 'Candidate must be an object',
    })
    return null
  }

  const text = parsePlainText(
    input.text,
    `${path}.text`,
    policy.maxCandidateCharacters,
    issues,
    'candidate.invalid',
  )

  if (
    text !== null &&
    text.split(/\s+/u).length > policy.maxWordsPerCandidate
  ) {
    issues.push({
      code: 'candidate.invalid',
      path: `${path}.text`,
      message: `Candidate may contain at most ${policy.maxWordsPerCandidate} words`,
    })
    return null
  }

  const difficulty = isWordDifficulty(input.difficulty)
    ? input.difficulty
    : null
  if (difficulty === null) {
    issues.push({
      code: 'candidate.invalid',
      path: `${path}.difficulty`,
      message: 'Candidate difficulty must be easy, medium, or hard',
    })
  }

  const tags = parseTags(input.tags, path, request.locale, policy, issues)

  if (text === null || difficulty === null || tags === null) return null

  return {
    text,
    normalizedText: normalizeForLookup(text, request.locale),
    difficulty,
    tags,
  }
}

function parseTags(
  input: unknown,
  candidatePath: string,
  locale: string,
  policy: WordBankValidationPolicy,
  issues: ValidationIssue[],
): readonly string[] | null {
  if (input === undefined) return []
  if (!Array.isArray(input) || input.length > policy.maxTagsPerCandidate) {
    issues.push({
      code: 'candidate.invalid',
      path: `${candidatePath}.tags`,
      message: `Tags must be an array of at most ${policy.maxTagsPerCandidate} strings`,
    })
    return null
  }

  const parsed: string[] = []
  for (const [index, tag] of input.entries()) {
    const normalized = parsePlainText(
      tag,
      `${candidatePath}.tags[${index}]`,
      MAX_TAG_CHARACTERS,
      issues,
      'candidate.invalid',
    )
    if (normalized === null) return null
    parsed.push(normalizeForLookup(normalized, locale))
  }

  return [...new Set(parsed)]
}

function parseGeneratorMetadata(
  input: unknown,
): ValidationResult<GeneratorMetadata> {
  if (!isRecord(input)) {
    return failure('metadata.invalid', 'metadata', 'Metadata must be an object')
  }

  const issues: ValidationIssue[] = []
  const source =
    input.source === 'curated' || input.source === 'model-generated'
      ? input.source
      : null
  if (source === null) {
    issues.push({
      code: 'metadata.invalid',
      path: 'metadata.source',
      message: 'Source must be curated or model-generated',
    })
  }

  const generator = parseIdentity(input.generator, 'metadata.generator', issues)
  const model =
    input.model === undefined
      ? undefined
      : parseModelIdentity(input.model, issues)

  if (source === 'model-generated' && model === undefined) {
    issues.push({
      code: 'metadata.invalid',
      path: 'metadata.model',
      message: 'Model-generated output must identify its model',
    })
  }

  const traceId = parseOptionalIdentifier(
    input.traceId,
    'metadata.traceId',
    MAX_ID_CHARACTERS,
    issues,
  )
  const generatedAt = parseOptionalTimestamp(input.generatedAt, issues)

  if (issues.length > 0 || source === null || generator === null) {
    return { ok: false, issues }
  }

  return {
    ok: true,
    value: {
      source,
      generator,
      ...(model === undefined ? {} : { model }),
      ...(traceId === undefined ? {} : { traceId }),
      ...(generatedAt === undefined ? {} : { generatedAt }),
    },
    issues: [],
  }
}

function parseIdentity(
  input: unknown,
  path: string,
  issues: ValidationIssue[],
): GeneratorMetadata['generator'] | null {
  if (!isRecord(input)) {
    issues.push({
      code: 'metadata.invalid',
      path,
      message: 'Generator identity must be an object',
    })
    return null
  }

  const id = parseIdentifier(input.id, `${path}.id`, MAX_ID_CHARACTERS, issues)
  const version = parseIdentifier(
    input.version,
    `${path}.version`,
    MAX_VERSION_CHARACTERS,
    issues,
  )
  const configurationVersion = parseOptionalIdentifier(
    input.configurationVersion,
    `${path}.configurationVersion`,
    MAX_VERSION_CHARACTERS,
    issues,
  )

  if (id === null || version === null) return null
  return {
    id,
    version,
    ...(configurationVersion === undefined ? {} : { configurationVersion }),
  }
}

function parseModelIdentity(
  input: unknown,
  issues: ValidationIssue[],
): GeneratorMetadata['model'] | undefined {
  if (!isRecord(input)) {
    issues.push({
      code: 'metadata.invalid',
      path: 'metadata.model',
      message: 'Model identity must be an object',
    })
    return undefined
  }

  const id = parseIdentifier(
    input.id,
    'metadata.model.id',
    MAX_ID_CHARACTERS,
    issues,
  )
  const revision = parseOptionalIdentifier(
    input.revision,
    'metadata.model.revision',
    MAX_VERSION_CHARACTERS,
    issues,
  )
  if (id === null) return undefined
  return { id, ...(revision === undefined ? {} : { revision }) }
}

function parseLocale(input: unknown, issues: ValidationIssue[]): string | null {
  if (input === undefined) return 'en-US'
  if (typeof input !== 'string') {
    issues.push({
      code: 'request.invalid',
      path: 'locale',
      message: 'Locale must be a valid language tag',
    })
    return null
  }

  try {
    const locales = Intl.getCanonicalLocales(input)
    if (locales.length === 1) return locales[0] ?? null
  } catch {
    // Fall through to one stable validation error.
  }

  issues.push({
    code: 'request.invalid',
    path: 'locale',
    message: 'Locale must be a valid language tag',
  })
  return null
}

function parseDifficulties(
  input: unknown,
  issues: ValidationIssue[],
): readonly WordDifficulty[] | null {
  if (input === undefined) return WORD_DIFFICULTIES
  if (!Array.isArray(input) || input.length === 0) {
    issues.push({
      code: 'request.invalid',
      path: 'allowedDifficulties',
      message: 'At least one difficulty is required',
    })
    return null
  }

  const values: WordDifficulty[] = []
  for (const [index, value] of input.entries()) {
    if (!isWordDifficulty(value)) {
      issues.push({
        code: 'request.invalid',
        path: `allowedDifficulties[${index}]`,
        message: 'Difficulty must be easy, medium, or hard',
      })
      continue
    }
    if (!values.includes(value)) values.push(value)
  }

  return values.length > 0 ? values : null
}

function parseExcludeTerms(
  input: unknown,
  locale: string | null,
  issues: ValidationIssue[],
): readonly string[] | null {
  if (input === undefined) return []
  if (!Array.isArray(input) || input.length > MAX_EXCLUDED_TERMS) {
    issues.push({
      code: 'request.invalid',
      path: 'excludeTerms',
      message: `Exclude terms must be an array with at most ${MAX_EXCLUDED_TERMS} entries`,
    })
    return null
  }

  const values: string[] = []
  for (const [index, value] of input.entries()) {
    const parsed = parsePlainText(
      value,
      `excludeTerms[${index}]`,
      64,
      issues,
      'request.invalid',
    )
    if (parsed !== null) values.push(parsed)
  }

  if (locale === null) return null
  const unique = new Map<string, string>()
  for (const value of values) {
    const key = normalizeForLookup(value, locale)
    if (!unique.has(key)) unique.set(key, value)
  }
  return [...unique.values()]
}

function parseOptionalTimestamp(
  input: unknown,
  issues: ValidationIssue[],
): string | undefined {
  if (input === undefined) return undefined
  if (
    typeof input !== 'string' ||
    !Number.isFinite(Date.parse(input)) ||
    input.length > 64
  ) {
    issues.push({
      code: 'metadata.invalid',
      path: 'metadata.generatedAt',
      message: 'generatedAt must be an ISO-compatible timestamp',
    })
    return undefined
  }
  return input
}

function parseOptionalIdentifier(
  input: unknown,
  path: string,
  maxCharacters: number,
  issues: ValidationIssue[],
): string | undefined {
  if (input === undefined) return undefined
  return parseIdentifier(input, path, maxCharacters, issues) ?? undefined
}

function parseIdentifier(
  input: unknown,
  path: string,
  maxCharacters: number,
  issues: ValidationIssue[],
): string | null {
  if (
    typeof input !== 'string' ||
    input.length === 0 ||
    input.length > maxCharacters ||
    !SIMPLE_ID.test(input)
  ) {
    issues.push({
      code: 'metadata.invalid',
      path,
      message: 'Identifier contains unsupported characters or length',
    })
    return null
  }
  return input
}

function parsePlainText(
  input: unknown,
  path: string,
  maxCharacters: number,
  issues: ValidationIssue[],
  code: 'request.invalid' | 'candidate.invalid',
): string | null {
  if (typeof input !== 'string') {
    issues.push({ code, path, message: 'Value must be a string' })
    return null
  }

  const value = input.normalize('NFKC').trim().replace(/\s+/gu, ' ')
  if (
    value.length === 0 ||
    value.length > maxCharacters ||
    DISALLOWED_PLAIN_TEXT.test(value)
  ) {
    issues.push({
      code,
      path,
      message: `Value must be plain text from 1 to ${maxCharacters} characters`,
    })
    return null
  }
  return value
}

function isWordDifficulty(value: unknown): value is WordDifficulty {
  return (WORD_DIFFICULTIES as readonly unknown[]).includes(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function positiveIntegerOr(value: unknown, fallbackValue: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : fallbackValue
}

function failure(
  code: ValidationIssue['code'],
  path: string,
  message: string,
): ValidationResult<never> {
  return { ok: false, issues: [{ code, path, message }] }
}
