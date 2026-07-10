import { createDeterministicFallbackGenerator } from './fallback'
import type {
  FallbackReason,
  GeneratorMetadata,
  ValidationIssue,
  ValidatedGeneratorOutput,
  WordBank,
  WordBankGenerationOptions,
  WordBankGenerationRequest,
  WordBankGenerationResult,
  WordBankGenerator,
  WordBankRoute,
  WordBankValidationPolicy,
} from './types'
import { WORD_BANK_CONTRACT_VERSION } from './types'
import {
  mergeWordBankValidationPolicy,
  parseWordBankGenerationRequest,
  validateGeneratorOutput,
} from './validation'

export const DEFAULT_GENERATOR_TIMEOUT_MS = 2_000
const MAX_GENERATOR_TIMEOUT_MS = 60_000
const TIMEOUT = Symbol('word-bank-generator-timeout')

type AttemptFailureKind = 'error' | 'timeout' | 'invalid-output'

type GeneratorAttempt =
  | {
      readonly ok: true
      readonly output: ValidatedGeneratorOutput
      readonly issues: readonly ValidationIssue[]
    }
  | {
      readonly ok: false
      readonly kind: AttemptFailureKind
      readonly issues: readonly ValidationIssue[]
    }

export async function generateWordBank(
  input: unknown,
  options: WordBankGenerationOptions = {},
): Promise<WordBankGenerationResult> {
  const requestResult = parseWordBankGenerationRequest(input)
  if (!requestResult.ok) {
    return {
      ok: false,
      code: 'invalid-request',
      issues: requestResult.issues,
    }
  }

  const request = requestResult.value
  const policy = mergeWordBankValidationPolicy(options.validationPolicy)
  const timeoutMs = normalizeTimeout(options.timeoutMs)
  const fallback =
    options.fallbackGenerator ?? createDeterministicFallbackGenerator()

  if (options.generator === undefined) {
    const localAttempt = await attemptGenerator(
      fallback,
      request,
      policy,
      timeoutMs,
    )
    if (!localAttempt.ok) {
      return {
        ok: false,
        code: 'fallback-unavailable',
        issues: localAttempt.issues,
      }
    }

    return {
      ok: true,
      bank: createWordBank(request, localAttempt.output, 'local-only'),
      issues: localAttempt.issues,
    }
  }

  const primaryAttempt = await attemptGenerator(
    options.generator,
    request,
    policy,
    timeoutMs,
  )
  if (primaryAttempt.ok) {
    return {
      ok: true,
      bank: createWordBank(request, primaryAttempt.output, 'primary'),
      issues: primaryAttempt.issues,
    }
  }

  const fallbackAttempt = await attemptGenerator(
    fallback,
    request,
    policy,
    timeoutMs,
  )
  const allIssues = [...primaryAttempt.issues, ...fallbackAttempt.issues]
  if (!fallbackAttempt.ok) {
    return {
      ok: false,
      code: 'fallback-unavailable',
      issues: allIssues,
    }
  }

  return {
    ok: true,
    bank: createWordBank(
      request,
      fallbackAttempt.output,
      'fallback',
      toFallbackReason(primaryAttempt.kind),
    ),
    issues: allIssues,
  }
}

async function attemptGenerator(
  generator: WordBankGenerator,
  request: WordBankGenerationRequest,
  policy: WordBankValidationPolicy,
  timeoutMs: number,
): Promise<GeneratorAttempt> {
  let response: unknown
  try {
    response = await invokeWithTimeout(generator, request, timeoutMs)
  } catch (error) {
    if (error === TIMEOUT) {
      return {
        ok: false,
        kind: 'timeout',
        issues: [
          {
            code: 'generator.timeout',
            path: '$',
            message: `Generator exceeded the ${timeoutMs}ms deadline`,
          },
        ],
      }
    }
    return {
      ok: false,
      kind: 'error',
      issues: [
        {
          code: 'generator.error',
          path: '$',
          message: 'Generator failed before producing a valid response',
        },
      ],
    }
  }

  const validation = validateGeneratorOutput(response, request, policy)
  if (!validation.ok) {
    return {
      ok: false,
      kind: 'invalid-output',
      issues: validation.issues,
    }
  }

  return {
    ok: true,
    output: validation.value,
    issues: validation.issues,
  }
}

async function invokeWithTimeout(
  generator: WordBankGenerator,
  request: WordBankGenerationRequest,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController()
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort()
      reject(TIMEOUT)
    }, timeoutMs)
  })

  const generation = Promise.resolve().then(() =>
    generator.generate(request, { signal: controller.signal }),
  )

  try {
    return await Promise.race([generation, timeout])
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }
}

function createWordBank(
  request: WordBankGenerationRequest,
  output: ValidatedGeneratorOutput,
  route: WordBankRoute,
  fallbackReason?: FallbackReason,
): WordBank {
  return {
    topic: request.topic,
    locale: request.locale,
    candidates: output.candidates,
    provenance: {
      ...copyMetadata(output.metadata),
      contractVersion: WORD_BANK_CONTRACT_VERSION,
      route,
      ...(fallbackReason === undefined ? {} : { fallbackReason }),
    },
  }
}

function copyMetadata(metadata: GeneratorMetadata): GeneratorMetadata {
  return {
    source: metadata.source,
    generator: { ...metadata.generator },
    ...(metadata.model === undefined ? {} : { model: { ...metadata.model } }),
    ...(metadata.traceId === undefined ? {} : { traceId: metadata.traceId }),
    ...(metadata.generatedAt === undefined
      ? {}
      : { generatedAt: metadata.generatedAt }),
  }
}

function toFallbackReason(kind: AttemptFailureKind): FallbackReason {
  if (kind === 'error') return 'primary-error'
  if (kind === 'timeout') return 'primary-timeout'
  return 'primary-invalid-output'
}

function normalizeTimeout(value: number | undefined): number {
  if (!Number.isFinite(value) || value === undefined || value <= 0) {
    return DEFAULT_GENERATOR_TIMEOUT_MS
  }
  return Math.min(MAX_GENERATOR_TIMEOUT_MS, Math.floor(value))
}
