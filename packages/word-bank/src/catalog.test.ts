import { describe, expect, it } from 'vitest'

import {
  InMemoryWordCatalogRepository,
  MASTER_WORD_COLLECTION_ID,
  WordCatalogService,
  validateCatalogWordInput,
  type CatalogWord,
  type CreateCatalogWordInput,
} from './index'

const strawberry: CreateCatalogWordInput = {
  term: 'Strawberry',
  definition: 'A sweet red fruit with seeds on its surface.',
  difficulty: 'easy',
  tags: ['Food', 'Fruit'],
  source: 'admin',
  provenance: { createdBy: 'admin-orien' },
}

function createHarness() {
  let nextId = 0
  const repository = new InMemoryWordCatalogRepository()
  const service = new WordCatalogService(repository, {
    createId: (kind) => `${kind}-${++nextId}`,
    now: () => new Date('2026-07-10T12:00:00.000Z'),
  })
  return { repository, service }
}

async function createCollection(
  service: WordCatalogService,
  name = 'Family Favorites',
) {
  const result = await service.createCollection(name)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('Test collection setup failed')
  return result.value
}

async function addWord(
  service: WordCatalogService,
  input: CreateCatalogWordInput = strawberry,
  collectionIds: readonly string[] = [],
) {
  const result = await service.addWord(input, collectionIds)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('Test word setup failed')
  return result.value
}

describe('catalog word normalization and identity', () => {
  it('maps generated case, spacing, and Unicode-width variants to one canonical term', () => {
    const variants = [
      'Strawberry',
      ' strawberry ',
      'STRAWBERRY',
      'ＳＴＲＡＷＢＥＲＲＹ',
      '  STRAWBERRY\n',
    ]

    for (let mask = 0; mask < 32; mask += 1) {
      const characters = [...'berry'].map((character, index) =>
        mask & (1 << index) ? character.toUpperCase() : character,
      )
      variants.push(`straw${characters.join('')}`)
    }

    const canonicalTerms = variants.map((term) => {
      const parsed = validateCatalogWordInput({ ...strawberry, term })
      expect(parsed.ok).toBe(true)
      return parsed.ok ? parsed.value.canonicalTerm : 'invalid'
    })

    expect(new Set(canonicalTerms)).toEqual(new Set(['strawberry']))
  })

  it('prevents canonical duplicates, including concurrent attempts', async () => {
    const { service } = createHarness()

    const [first, second] = await Promise.all([
      service.addWord(strawberry),
      service.addWord({ ...strawberry, term: '  ＳＴＲＡＷＢＥＲＲＹ ' }),
    ])

    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1)
    const rejected = first.ok ? second : first
    expect(rejected).toMatchObject({
      ok: false,
      issues: [{ code: 'word.duplicate', path: 'word.term' }],
    })
    expect(await service.listWords()).toHaveLength(1)
  })

  it('allows the same canonical spelling in different locales', async () => {
    const { service } = createHarness()

    expect(await service.addWord(strawberry)).toMatchObject({ ok: true })
    expect(
      await service.addWord({
        ...strawberry,
        locale: 'fr-FR',
        definition: 'Un fruit rouge sucre avec des graines en surface.',
      }),
    ).toMatchObject({ ok: true })

    expect(await service.listWords()).toHaveLength(2)
    expect(
      (await service.listWords()).map(({ locale, canonicalTerm }) => [
        locale,
        canonicalTerm,
      ]),
    ).toEqual([
      ['en-US', 'strawberry'],
      ['fr-FR', 'strawberry'],
    ])
  })

  it('keeps a stable ID while updates advance the word version', async () => {
    const { service } = createHarness()
    const original = await addWord(service)

    const update = await service.updateWord(
      original.id,
      {
        definition: 'An edible red fruit dotted with many small seeds.',
        difficulty: 'medium',
      },
      1,
    )

    expect(update.ok).toBe(true)
    if (!update.ok) return
    expect(update.value).toMatchObject({
      id: original.id,
      term: 'Strawberry',
      difficulty: 'medium',
      version: 2,
    })

    const stale = await service.updateWord(
      original.id,
      { difficulty: 'hard' },
      1,
    )
    expect(stale).toMatchObject({
      ok: false,
      issues: [{ code: 'word.version-conflict', wordId: original.id }],
    })
    expect(await service.getWord(original.id)).toMatchObject({
      difficulty: 'medium',
      version: 2,
    })
  })

  it('rejects explicit nulls in partial updates instead of treating them as absent', async () => {
    const { service } = createHarness()
    const original = await addWord(service)

    expect(
      await service.updateWord(original.id, { definition: null }),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'input.invalid', path: 'patch.definition' }],
    })
    expect(await service.getWord(original.id)).toMatchObject({
      definition: strawberry.definition,
      version: 1,
    })
  })

  it('requires auditable provider metadata for model-generated words', async () => {
    const { service } = createHarness()
    const rejected = await service.addWord({
      ...strawberry,
      source: 'model-generated',
      provenance: {},
    })
    expect(rejected).toMatchObject({
      ok: false,
      issues: [{ path: 'word.provenance' }],
    })

    const accepted = await service.addWord({
      ...strawberry,
      source: 'model-generated',
      provenance: {
        generator: { id: 'topic-adapter', version: '1' },
        model: { id: 'future-model', revision: '2026-07' },
        sourceReference: 'trace-123',
      },
    })
    expect(accepted.ok).toBe(true)
  })
})

describe('custom collections and derived Master collection', () => {
  it('creates normalized unique collection names and reserves Master', async () => {
    const { service } = createHarness()
    expect(
      await service.createCollection('  Family   Favorites '),
    ).toMatchObject({
      ok: true,
      value: {
        name: 'Family Favorites',
        normalizedName: 'family favorites',
        kind: 'custom',
      },
    })
    expect(await service.createCollection('FAMILY FAVORITES')).toMatchObject({
      ok: false,
      issues: [{ code: 'collection.duplicate-name' }],
    })
    expect(await service.createCollection(' master ')).toMatchObject({
      ok: false,
      issues: [{ code: 'collection.duplicate-name' }],
    })
  })

  it('stores stable word references, not copied word text', async () => {
    const { service } = createHarness()
    const collection = await createCollection(service)
    const word = await addWord(service, strawberry, [collection.id])

    const before = await service.getCollection(collection.id)
    expect(before?.wordIds).toEqual([word.id])
    expect(before).not.toHaveProperty('words')
    expect(JSON.stringify(before)).not.toContain('Strawberry')

    await service.updateWord(word.id, {
      term: 'Wild strawberry',
      definition: 'A small wild member of the strawberry family.',
    })
    expect((await service.getCollection(collection.id))?.wordIds).toEqual([
      word.id,
    ])
    expect(await service.getWord(word.id)).toMatchObject({
      term: 'Wild strawberry',
    })
  })

  it('derives Master from every active, eligible, canonical word', async () => {
    const { service } = createHarness()
    const active = await addWord(service)
    const inactive = await addWord(service, {
      ...strawberry,
      term: 'Volcano',
      definition: 'A mountain through which lava can erupt.',
      status: 'inactive',
    })
    const ineligible = await addWord(service, {
      ...strawberry,
      term: 'Tax return',
      definition: 'A form used to report taxes.',
      eligibleForPlay: false,
    })

    expect(
      await service.getCollection(MASTER_WORD_COLLECTION_ID),
    ).toMatchObject({
      kind: 'master',
      wordIds: [active.id],
    })

    await service.updateWord(inactive.id, { status: 'active' })
    await service.updateWord(ineligible.id, { eligibleForPlay: true })
    expect(
      (await service.getCollection(MASTER_WORD_COLLECTION_ID))?.wordIds,
    ).toEqual([active.id, inactive.id, ineligible.id].sort())

    await service.deactivateWord(active.id)
    expect(
      (await service.getCollection(MASTER_WORD_COLLECTION_ID))?.wordIds,
    ).not.toContain(active.id)
  })

  it('retains custom membership on deactivation but filters gameplay reads', async () => {
    const { service } = createHarness()
    const collection = await createCollection(service)
    const word = await addWord(service, strawberry, [collection.id])

    await service.deactivateWord(word.id)

    expect((await service.getCollection(collection.id))?.wordIds).toEqual([
      word.id,
    ])
    expect(await service.listPlayableWords(collection.id)).toEqual([])
  })

  it('removes deleted IDs from every custom collection and Master', async () => {
    const { service } = createHarness()
    const first = await createCollection(service, 'First')
    const second = await createCollection(service, 'Second')
    const word = await addWord(service, strawberry, [first.id, second.id])

    expect(await service.deleteWord(word.id)).toMatchObject({ ok: true })
    expect(await service.getWord(word.id)).toBeUndefined()
    expect((await service.getCollection(first.id))?.wordIds).toEqual([])
    expect((await service.getCollection(second.id))?.wordIds).toEqual([])
    expect(
      (await service.getCollection(MASTER_WORD_COLLECTION_ID))?.wordIds,
    ).toEqual([])
  })

  it('supports idempotent membership and rejects manual Master edits', async () => {
    const { service } = createHarness()
    const collection = await createCollection(service)
    const word = await addWord(service)

    await service.addWordToCollection(word.id, collection.id)
    await service.addWordToCollection(word.id, collection.id)
    expect((await service.getCollection(collection.id))?.wordIds).toEqual([
      word.id,
    ])

    await service.removeWordFromCollection(word.id, collection.id)
    expect((await service.getCollection(collection.id))?.wordIds).toEqual([])
    expect(await service.getWord(word.id)).toBeDefined()

    expect(
      await service.removeWordFromCollection(
        word.id,
        MASTER_WORD_COLLECTION_ID,
      ),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'collection.master-read-only' }],
    })
  })
})

describe('atomic catalog imports', () => {
  it('imports validated words and adds only their stable IDs to a collection', async () => {
    const { service } = createHarness()
    const collection = await createCollection(service)

    const result = await service.importWords({
      collectionId: collection.id,
      words: [
        strawberry,
        {
          term: 'Lighthouse',
          definition: 'A tower with a light that guides ships.',
          difficulty: 'medium',
          tags: ['Coast'],
          source: 'imported',
          provenance: { sourceReference: 'orien-words-v1.csv' },
        },
      ],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.words).toHaveLength(2)
    expect(result.value.words[1]).toMatchObject({
      definition: 'A tower with a light that guides ships.',
      source: 'imported',
      version: 1,
      provenance: { sourceReference: 'orien-words-v1.csv' },
    })
    expect((await service.getCollection(collection.id))?.wordIds).toEqual(
      result.value.words.map(({ id }) => id),
    )
  })

  it('reports every malformed row and rolls back every otherwise-valid row', async () => {
    const { service } = createHarness()
    const collection = await createCollection(service)

    const result = await service.importWords({
      collectionId: collection.id,
      words: [
        strawberry,
        {
          term: '',
          definition: '',
          difficulty: 'impossible',
          source: 'spreadsheet',
        },
        {
          term: 'Lighthouse',
          definition: 42,
          difficulty: 'medium',
          source: 'imported',
        },
      ],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.map(({ path }) => path)).toEqual(
      expect.arrayContaining([
        'words[1].term',
        'words[1].definition',
        'words[1].difficulty',
        'words[1].source',
        'words[2].definition',
      ]),
    )
    expect(await service.listWords()).toEqual([])
    expect((await service.getCollection(collection.id))?.wordIds).toEqual([])
  })

  it('rejects canonical duplicates within one import without partial writes', async () => {
    const { service } = createHarness()
    const result = await service.importWords({
      words: [strawberry, { ...strawberry, term: ' ＳＴＲＡＷＢＥＲＲＹ ' }],
    })

    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'import.duplicate',
          path: 'words[1].term',
          message: expect.stringContaining('words[0].term'),
        },
      ],
    })
    expect(await service.listWords()).toEqual([])
  })

  it('imports the same canonical spelling when its locales differ', async () => {
    const { service } = createHarness()

    const result = await service.importWords({
      words: [
        strawberry,
        {
          ...strawberry,
          locale: 'fr-FR',
          definition: 'Un fruit rouge sucre avec des graines en surface.',
        },
      ],
    })

    expect(result).toMatchObject({ ok: true, value: { words: [{}, {}] } })
    expect(await service.listWords()).toHaveLength(2)
  })

  it('rejects an existing canonical term and rolls back new rows', async () => {
    const { service } = createHarness()
    const existing = await addWord(service)

    const result = await service.importWords({
      words: [
        {
          ...strawberry,
          term: 'Lighthouse',
          definition: 'A coastal signal tower.',
        },
        { ...strawberry, term: ' strawberry ' },
      ],
    })

    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: 'word.duplicate', wordId: existing.id }],
    })
    expect((await service.listWords()).map(({ term }) => term)).toEqual([
      'Strawberry',
    ])
  })

  it('rejects imports into inactive collections before writing words', async () => {
    const { service } = createHarness()
    const collection = await createCollection(service)
    await service.setCollectionStatus(collection.id, 'inactive')

    expect(
      await service.importWords({
        collectionId: collection.id,
        words: [strawberry],
      }),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'collection.inactive', collectionId: collection.id }],
    })
    expect(await service.listWords()).toEqual([])
  })

  it('rolls back the in-memory transaction when storage work throws', async () => {
    const { repository } = createHarness()
    const word: CatalogWord = {
      id: 'word-for-rollback',
      term: 'Bridge',
      canonicalTerm: 'bridge',
      definition: 'A structure that crosses a gap.',
      locale: 'en-US',
      difficulty: 'easy',
      tags: [],
      source: 'admin',
      provenance: {},
      status: 'active',
      eligibleForPlay: true,
      version: 1,
      createdAt: '2026-07-10T12:00:00.000Z',
      updatedAt: '2026-07-10T12:00:00.000Z',
    }

    await expect(
      repository.transaction(async (transaction) => {
        await transaction.saveWord(word)
        throw new Error('simulated storage failure')
      }),
    ).rejects.toThrow('simulated storage failure')
    expect(await repository.listWords()).toEqual([])
  })
})
