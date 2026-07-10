import { describe, expect, it } from 'vitest'

import {
  WORD_BANK_EVALUATION_FIXTURES,
  evaluateWordBankFixture,
  generateWordBank,
  parseWordBankGenerationRequest,
  type WordBankGenerator,
} from './index'

const modelMetadata = {
  source: 'model-generated',
  generator: {
    id: 'topic-word-adapter',
    version: '1',
    configurationVersion: 'prompt-v3',
  },
  model: { id: 'drawing-words-model', revision: '2026-07' },
  traceId: 'trace-123',
  generatedAt: '2026-07-10T12:00:00.000Z',
}

function modelGenerator(candidates: readonly unknown[]): WordBankGenerator {
  return {
    async generate() {
      return {
        payload: { candidates },
        metadata: modelMetadata,
      }
    },
  }
}

describe('word-bank generation', () => {
  it('uses a deterministic curated bank when no external generator exists', async () => {
    const request = {
      topic: 'animals',
      count: 5,
      locale: 'en-US',
      seed: 'same-seed',
    }

    const first = await generateWordBank(request)
    const second = await generateWordBank(request)

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (!first.ok || !second.ok) return

    expect(first.bank.candidates).toEqual(second.bank.candidates)
    expect(first.bank.provenance).toMatchObject({
      source: 'curated',
      route: 'local-only',
      contractVersion: 1,
      generator: {
        id: 'local-curated-word-bank',
      },
    })
    expect(first.bank.provenance.model).toBeUndefined()
  })

  it('preserves provider-neutral model and generator provenance', async () => {
    const result = await generateWordBank(
      { topic: 'space', count: 2, locale: 'en-US' },
      {
        generator: modelGenerator([
          { text: 'moon base', difficulty: 'medium', tags: ['space'] },
          { text: 'rocket launch', difficulty: 'hard', tags: ['space'] },
        ]),
      },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.bank.provenance).toEqual({
      ...modelMetadata,
      contractVersion: 1,
      route: 'primary',
    })
  })

  it('drops malformed, blocked, excluded, and duplicate candidates', async () => {
    const result = await generateWordBank(
      {
        topic: 'general',
        count: 2,
        locale: 'en-US',
        excludeTerms: ['cat'],
      },
      {
        generator: modelGenerator([
          { text: 'cat', difficulty: 'easy' },
          { text: 'dog', difficulty: 'easy' },
          { text: 'Sun', difficulty: 'easy', tags: ['general'] },
          { text: ' sun ', difficulty: 'medium', tags: ['general'] },
          { text: '<b>moon</b>', difficulty: 'easy', tags: ['general'] },
          { text: 'Moon', difficulty: 'easy', tags: ['general'] },
        ]),
        validationPolicy: { blockedTerms: ['dog'] },
      },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(
      result.bank.candidates.map(({ normalizedText }) => normalizedText),
    ).toEqual(['sun', 'moon'])
    expect(result.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'candidate.excluded',
        'candidate.blocked',
        'candidate.duplicate',
        'candidate.invalid',
      ]),
    )
  })

  it('falls back when the primary output cannot satisfy the contract', async () => {
    const result = await generateWordBank(
      { topic: 'animals', count: 3 },
      {
        generator: modelGenerator([{ text: 'cat', difficulty: 'impossible' }]),
      },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.bank.candidates).toHaveLength(3)
    expect(result.bank.provenance).toMatchObject({
      source: 'curated',
      route: 'fallback',
      fallbackReason: 'primary-invalid-output',
    })
    expect(
      result.issues.some(({ code }) => code === 'candidates.insufficient'),
    ).toBe(true)
  })

  it('falls back without exposing an external generator error', async () => {
    const generator: WordBankGenerator = {
      async generate() {
        throw new Error('secret provider detail')
      },
    }

    const result = await generateWordBank(
      { topic: 'food', count: 3 },
      { generator },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.bank.provenance.fallbackReason).toBe('primary-error')
    expect(result.issues).toContainEqual({
      code: 'generator.error',
      path: '$',
      message: 'Generator failed before producing a valid response',
    })
  })

  it('aborts a timed-out generator and uses the local fallback', async () => {
    let aborted = false
    const generator: WordBankGenerator = {
      async generate(_request, { signal }) {
        return await new Promise((resolve) => {
          signal.addEventListener(
            'abort',
            () => {
              aborted = true
              resolve(undefined)
            },
            { once: true },
          )
        })
      },
    }

    const result = await generateWordBank(
      { topic: 'space', count: 2 },
      { generator, timeoutMs: 5 },
    )

    expect(result.ok).toBe(true)
    expect(aborted).toBe(true)
    if (!result.ok) return
    expect(result.bank.provenance.fallbackReason).toBe('primary-timeout')
  })

  it('rejects invalid requests before invoking any generator', async () => {
    let called = false
    const generator: WordBankGenerator = {
      async generate() {
        called = true
        return undefined
      },
    }

    const result = await generateWordBank(
      { topic: '', count: 0 },
      { generator },
    )

    expect(result).toMatchObject({ ok: false, code: 'invalid-request' })
    expect(called).toBe(false)
  })

  it('fails closed when both primary and fallback are unusable', async () => {
    const broken: WordBankGenerator = {
      async generate() {
        return { payload: null, metadata: null }
      },
    }

    const result = await generateWordBank(
      { topic: 'animals', count: 2 },
      { generator: broken, fallbackGenerator: broken },
    )

    expect(result).toMatchObject({
      ok: false,
      code: 'fallback-unavailable',
    })
  })

  it('requires model identity for model-generated provenance', async () => {
    const generator: WordBankGenerator = {
      async generate() {
        return {
          payload: {
            candidates: [
              { text: 'rocket', difficulty: 'easy', tags: ['space'] },
            ],
          },
          metadata: {
            source: 'model-generated',
            generator: { id: 'adapter', version: '1' },
          },
        }
      },
    }

    const result = await generateWordBank(
      { topic: 'space', count: 1 },
      { generator },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.bank.provenance.route).toBe('fallback')
    expect(result.issues.some(({ code }) => code === 'metadata.invalid')).toBe(
      true,
    )
  })
})

describe('request and evaluation fixtures', () => {
  it('canonicalizes request defaults at runtime', () => {
    expect(
      parseWordBankGenerationRequest({
        topic: '  Space  ',
        count: 3,
        locale: 'en-us',
        excludeTerms: [' Moon ', 'moon'],
      }),
    ).toMatchObject({
      ok: true,
      value: {
        topic: 'Space',
        count: 3,
        locale: 'en-US',
        excludeTerms: ['Moon'],
        allowedDifficulties: ['easy', 'medium', 'hard'],
      },
    })
  })

  it.each(WORD_BANK_EVALUATION_FIXTURES)(
    'passes deterministic exact checks for $id',
    async (fixture) => {
      const result = await generateWordBank(fixture.request)

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(evaluateWordBankFixture(result.bank, fixture)).toMatchObject({
        fixtureId: fixture.id,
        passed: true,
      })
    },
  )
})
