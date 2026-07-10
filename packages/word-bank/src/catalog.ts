import type { GeneratorIdentity, ModelIdentity, WordDifficulty } from './types'
import { normalizeForLookup } from './validation'

export const MASTER_WORD_COLLECTION_ID = 'master' as const
export const MASTER_WORD_COLLECTION_NAME = 'Master' as const

export const CATALOG_WORD_SOURCES = [
  'admin',
  'curated',
  'imported',
  'model-generated',
] as const

export type CatalogWordSource = (typeof CATALOG_WORD_SOURCES)[number]
export type CatalogWordStatus = 'active' | 'inactive'
export type WordCollectionStatus = 'active' | 'inactive'

export interface CatalogWordProvenance {
  /** Account, admin, or system identifier. It is deliberately provider-neutral. */
  readonly createdBy?: string
  /** Import file, catalog revision, or other opaque lineage reference. */
  readonly sourceReference?: string
  readonly generator?: GeneratorIdentity
  readonly model?: ModelIdentity
}

export interface CatalogWord {
  readonly id: string
  readonly term: string
  /** NFKC-normalized, whitespace-collapsed, case-folded canonical term. */
  readonly canonicalTerm: string
  readonly definition: string
  readonly locale: string
  readonly difficulty: WordDifficulty
  readonly tags: readonly string[]
  readonly source: CatalogWordSource
  readonly provenance: CatalogWordProvenance
  readonly status: CatalogWordStatus
  readonly eligibleForPlay: boolean
  /** Monotonic optimistic-concurrency version for this stable word ID. */
  readonly version: number
  readonly createdAt: string
  readonly updatedAt: string
}

export interface WordCollection {
  readonly id: string
  readonly name: string
  readonly normalizedName: string
  readonly kind: 'master' | 'custom'
  readonly status: WordCollectionStatus
  /** Stable word IDs; word text is never copied into a collection. */
  readonly wordIds: readonly string[]
}

export interface CustomWordCollection extends WordCollection {
  readonly kind: 'custom'
}

export interface MasterWordCollection extends WordCollection {
  readonly id: typeof MASTER_WORD_COLLECTION_ID
  readonly name: typeof MASTER_WORD_COLLECTION_NAME
  readonly kind: 'master'
  readonly status: 'active'
}

export type WordCatalogIssueCode =
  | 'input.invalid'
  | 'word.not-found'
  | 'word.duplicate'
  | 'word.version-conflict'
  | 'collection.not-found'
  | 'collection.duplicate-name'
  | 'collection.inactive'
  | 'collection.master-read-only'
  | 'import.duplicate'
  | 'id.conflict'

export interface WordCatalogIssue {
  readonly code: WordCatalogIssueCode
  readonly path: string
  readonly message: string
  readonly wordId?: string
  readonly collectionId?: string
}

export type WordCatalogResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly WordCatalogIssue[] }

export interface CreateCatalogWordInput {
  readonly term: string
  readonly definition: string
  readonly locale?: string
  readonly difficulty: WordDifficulty
  readonly tags?: readonly string[]
  readonly source: CatalogWordSource
  readonly provenance?: CatalogWordProvenance
  readonly status?: CatalogWordStatus
  readonly eligibleForPlay?: boolean
}

export interface ImportCatalogWordsResult {
  readonly collectionId: string
  readonly words: readonly CatalogWord[]
}

/**
 * Persistence transaction used by the domain service. A SQL transaction,
 * Durable Object storage transaction, or test adapter can implement this port.
 */
export interface WordCatalogTransaction {
  getWord(id: string): Promise<CatalogWord | undefined>
  findWordByLocaleAndCanonicalTerm(
    locale: string,
    canonicalTerm: string,
  ): Promise<CatalogWord | undefined>
  listWords(): Promise<readonly CatalogWord[]>
  saveWord(word: CatalogWord): Promise<void>
  deleteWord(id: string): Promise<void>
  getCustomCollection(id: string): Promise<CustomWordCollection | undefined>
  findCustomCollectionByNormalizedName(
    normalizedName: string,
  ): Promise<CustomWordCollection | undefined>
  listCustomCollections(): Promise<readonly CustomWordCollection[]>
  saveCustomCollection(collection: CustomWordCollection): Promise<void>
}

/** Storage-agnostic repository boundary owned by the word-catalog domain. */
export interface WordCatalogRepository {
  getWord(id: string): Promise<CatalogWord | undefined>
  findWordByLocaleAndCanonicalTerm(
    locale: string,
    canonicalTerm: string,
  ): Promise<CatalogWord | undefined>
  listWords(): Promise<readonly CatalogWord[]>
  getCustomCollection(id: string): Promise<CustomWordCollection | undefined>
  findCustomCollectionByNormalizedName(
    normalizedName: string,
  ): Promise<CustomWordCollection | undefined>
  listCustomCollections(): Promise<readonly CustomWordCollection[]>
  transaction<T>(
    work: (transaction: WordCatalogTransaction) => Promise<T>,
  ): Promise<T>
}

export interface WordCatalogServiceDependencies {
  readonly createId?: (kind: 'word' | 'collection') => string
  readonly now?: () => Date
}

interface ValidatedWordInput {
  readonly term: string
  readonly canonicalTerm: string
  readonly definition: string
  readonly locale: string
  readonly difficulty: WordDifficulty
  readonly tags: readonly string[]
  readonly source: CatalogWordSource
  readonly provenance: CatalogWordProvenance
  readonly status: CatalogWordStatus
  readonly eligibleForPlay: boolean
}

const MAX_TERM_CHARACTERS = 64
const MAX_DEFINITION_CHARACTERS = 1_000
const MAX_COLLECTION_NAME_CHARACTERS = 80
const MAX_TAGS = 12
const MAX_TAG_CHARACTERS = 32
const MAX_PROVENANCE_CHARACTERS = 160
const MAX_IMPORT_WORDS = 1_000
const DISALLOWED_PLAIN_TEXT = /[\u0000-\u001f\u007f<>]/u

export class WordCatalogService {
  readonly #repository: WordCatalogRepository
  readonly #createId: (kind: 'word' | 'collection') => string
  readonly #now: () => Date

  constructor(
    repository: WordCatalogRepository,
    dependencies: WordCatalogServiceDependencies = {},
  ) {
    this.#repository = repository
    this.#createId =
      dependencies.createId ?? ((kind) => `${kind}_${crypto.randomUUID()}`)
    this.#now = dependencies.now ?? (() => new Date())
  }

  async getWord(id: string): Promise<CatalogWord | undefined> {
    return await this.#repository.getWord(id)
  }

  async listWords(): Promise<readonly CatalogWord[]> {
    return await this.#repository.listWords()
  }

  async getCollection(id: string): Promise<WordCollection | undefined> {
    if (id === MASTER_WORD_COLLECTION_ID) return await this.#masterCollection()
    return await this.#repository.getCustomCollection(id)
  }

  async listCollections(): Promise<readonly WordCollection[]> {
    return [
      await this.#masterCollection(),
      ...(await this.#repository.listCustomCollections()),
    ]
  }

  async listPlayableWords(
    collectionId: string,
  ): Promise<readonly CatalogWord[]> {
    const collection = await this.getCollection(collectionId)
    if (collection === undefined || collection.status !== 'active') return []

    const ids = new Set(collection.wordIds)
    return (await this.#repository.listWords()).filter(
      (word) =>
        ids.has(word.id) && word.status === 'active' && word.eligibleForPlay,
    )
  }

  async createCollection(
    nameInput: unknown,
  ): Promise<WordCatalogResult<CustomWordCollection>> {
    const issues: WordCatalogIssue[] = []
    const name = parsePlainText(
      nameInput,
      'name',
      MAX_COLLECTION_NAME_CHARACTERS,
      issues,
    )
    if (name === null) return { ok: false, issues }

    const normalizedName = normalizeForLookup(name)
    if (
      normalizedName === normalizeForLookup(MASTER_WORD_COLLECTION_NAME) ||
      normalizedName === MASTER_WORD_COLLECTION_ID
    ) {
      return failure(
        'collection.duplicate-name',
        'name',
        'The Master collection name is reserved',
      )
    }

    return await this.#repository.transaction(async (transaction) => {
      if (
        (await transaction.findCustomCollectionByNormalizedName(
          normalizedName,
        )) !== undefined
      ) {
        return failure(
          'collection.duplicate-name',
          'name',
          'A collection with this normalized name already exists',
        )
      }

      const id = this.#createId('collection')
      if ((await transaction.getCustomCollection(id)) !== undefined) {
        return failure(
          'id.conflict',
          'id',
          'The collection ID generator produced an existing ID',
        )
      }

      const collection: CustomWordCollection = {
        id,
        name,
        normalizedName,
        kind: 'custom',
        status: 'active',
        wordIds: [],
      }
      await transaction.saveCustomCollection(collection)
      return success(collection)
    })
  }

  async addWord(
    input: unknown,
    collectionIds: readonly string[] = [],
  ): Promise<WordCatalogResult<CatalogWord>> {
    const parsed = validateCatalogWordInput(input, 'word')
    if (!parsed.ok) return parsed

    return await this.#repository.transaction(async (transaction) => {
      const membership = await validateMembershipTargets(
        transaction,
        collectionIds,
      )
      if (!membership.ok) return membership

      const duplicate = await transaction.findWordByLocaleAndCanonicalTerm(
        parsed.value.locale,
        parsed.value.canonicalTerm,
      )
      if (duplicate !== undefined) {
        return failure(
          'word.duplicate',
          'word.term',
          `A word with this canonical term already exists in ${parsed.value.locale}`,
          { wordId: duplicate.id },
        )
      }

      const id = this.#createId('word')
      if ((await transaction.getWord(id)) !== undefined) {
        return failure(
          'id.conflict',
          'word.id',
          'The word ID generator produced an existing ID',
        )
      }

      const word = createCatalogWord(id, parsed.value, this.#timestamp())
      await transaction.saveWord(word)
      for (const collection of membership.value) {
        await transaction.saveCustomCollection(
          appendMembership(collection, word.id),
        )
      }
      return success(word)
    })
  }

  async updateWord(
    id: string,
    patch: unknown,
    expectedVersion?: number,
  ): Promise<WordCatalogResult<CatalogWord>> {
    if (!isRecord(patch)) {
      return failure('input.invalid', 'patch', 'Word update must be an object')
    }

    return await this.#repository.transaction(async (transaction) => {
      const current = await transaction.getWord(id)
      if (current === undefined) return wordNotFound(id)
      if (
        expectedVersion !== undefined &&
        current.version !== expectedVersion
      ) {
        return failure(
          'word.version-conflict',
          'expectedVersion',
          `Expected word version ${expectedVersion} but found ${current.version}`,
          { wordId: id },
        )
      }

      const parsed = validateCatalogWordInput(
        {
          term: valueOrCurrent(patch, 'term', current.term),
          definition: valueOrCurrent(patch, 'definition', current.definition),
          locale: valueOrCurrent(patch, 'locale', current.locale),
          difficulty: valueOrCurrent(patch, 'difficulty', current.difficulty),
          tags: valueOrCurrent(patch, 'tags', current.tags),
          source: valueOrCurrent(patch, 'source', current.source),
          provenance: valueOrCurrent(patch, 'provenance', current.provenance),
          status: valueOrCurrent(patch, 'status', current.status),
          eligibleForPlay: valueOrCurrent(
            patch,
            'eligibleForPlay',
            current.eligibleForPlay,
          ),
        },
        'patch',
      )
      if (!parsed.ok) return parsed

      const duplicate = await transaction.findWordByLocaleAndCanonicalTerm(
        parsed.value.locale,
        parsed.value.canonicalTerm,
      )
      if (duplicate !== undefined && duplicate.id !== id) {
        return failure(
          'word.duplicate',
          'patch.term',
          `A word with this canonical term already exists in ${parsed.value.locale}`,
          { wordId: duplicate.id },
        )
      }

      const updated: CatalogWord = {
        ...current,
        ...parsed.value,
        provenance: { ...parsed.value.provenance },
        tags: [...parsed.value.tags],
        version: current.version + 1,
        updatedAt: this.#timestamp(),
      }
      await transaction.saveWord(updated)
      return success(updated)
    })
  }

  async deactivateWord(
    id: string,
    expectedVersion?: number,
  ): Promise<WordCatalogResult<CatalogWord>> {
    return await this.updateWord(id, { status: 'inactive' }, expectedVersion)
  }

  async deleteWord(
    id: string,
  ): Promise<WordCatalogResult<{ readonly deletedWordId: string }>> {
    return await this.#repository.transaction(async (transaction) => {
      if ((await transaction.getWord(id)) === undefined) return wordNotFound(id)

      await transaction.deleteWord(id)
      for (const collection of await transaction.listCustomCollections()) {
        if (!collection.wordIds.includes(id)) continue
        await transaction.saveCustomCollection(removeMembership(collection, id))
      }
      return success({ deletedWordId: id })
    })
  }

  async addWordToCollection(
    wordId: string,
    collectionId: string,
  ): Promise<WordCatalogResult<CustomWordCollection>> {
    if (collectionId === MASTER_WORD_COLLECTION_ID) {
      return masterReadOnly(collectionId)
    }
    return await this.#repository.transaction(async (transaction) => {
      if ((await transaction.getWord(wordId)) === undefined) {
        return wordNotFound(wordId)
      }
      const collection = await transaction.getCustomCollection(collectionId)
      if (collection === undefined) return collectionNotFound(collectionId)
      if (collection.status !== 'active')
        return collectionInactive(collectionId)

      const updated = appendMembership(collection, wordId)
      await transaction.saveCustomCollection(updated)
      return success(updated)
    })
  }

  async removeWordFromCollection(
    wordId: string,
    collectionId: string,
  ): Promise<WordCatalogResult<CustomWordCollection>> {
    if (collectionId === MASTER_WORD_COLLECTION_ID) {
      return masterReadOnly(collectionId)
    }
    return await this.#repository.transaction(async (transaction) => {
      const collection = await transaction.getCustomCollection(collectionId)
      if (collection === undefined) return collectionNotFound(collectionId)
      const updated = removeMembership(collection, wordId)
      await transaction.saveCustomCollection(updated)
      return success(updated)
    })
  }

  async setCollectionStatus(
    collectionId: string,
    status: WordCollectionStatus,
  ): Promise<WordCatalogResult<CustomWordCollection>> {
    if (collectionId === MASTER_WORD_COLLECTION_ID) {
      return masterReadOnly(collectionId)
    }
    if (status !== 'active' && status !== 'inactive') {
      return failure(
        'input.invalid',
        'status',
        'Collection status must be active or inactive',
      )
    }
    return await this.#repository.transaction(async (transaction) => {
      const collection = await transaction.getCustomCollection(collectionId)
      if (collection === undefined) return collectionNotFound(collectionId)
      const updated: CustomWordCollection = { ...collection, status }
      await transaction.saveCustomCollection(updated)
      return success(updated)
    })
  }

  /**
   * Validates the whole import before its first write. The repository transaction
   * provides the second safety net if a storage operation fails mid-commit.
   */
  async importWords(
    input: unknown,
  ): Promise<WordCatalogResult<ImportCatalogWordsResult>> {
    const parsed = parseImport(input)
    if (!parsed.ok) return parsed

    return await this.#repository.transaction(async (transaction) => {
      let collection: CustomWordCollection | undefined
      if (parsed.value.collectionId !== MASTER_WORD_COLLECTION_ID) {
        collection = await transaction.getCustomCollection(
          parsed.value.collectionId,
        )
        if (collection === undefined) {
          return collectionNotFound(parsed.value.collectionId)
        }
        if (collection.status !== 'active') {
          return collectionInactive(collection.id)
        }
      }

      const issues: WordCatalogIssue[] = []
      for (const [index, word] of parsed.value.words.entries()) {
        const duplicate = await transaction.findWordByLocaleAndCanonicalTerm(
          word.locale,
          word.canonicalTerm,
        )
        if (duplicate !== undefined) {
          issues.push({
            code: 'word.duplicate',
            path: `words[${index}].term`,
            message: `A word with this canonical term already exists in ${word.locale}`,
            wordId: duplicate.id,
          })
        }
      }
      if (issues.length > 0) return { ok: false, issues }

      const ids: string[] = []
      for (const [index] of parsed.value.words.entries()) {
        const id = this.#createId('word')
        if (ids.includes(id) || (await transaction.getWord(id)) !== undefined) {
          issues.push({
            code: 'id.conflict',
            path: `words[${index}].id`,
            message: 'The word ID generator produced a duplicate ID',
          })
        }
        ids.push(id)
      }
      if (issues.length > 0) return { ok: false, issues }

      const timestamp = this.#timestamp()
      const words = parsed.value.words.map((word, index) =>
        createCatalogWord(ids[index] ?? '', word, timestamp),
      )
      for (const word of words) await transaction.saveWord(word)

      if (collection !== undefined) {
        const updated: CustomWordCollection = {
          ...collection,
          wordIds: [...new Set([...collection.wordIds, ...ids])],
        }
        await transaction.saveCustomCollection(updated)
      }

      return success({ collectionId: parsed.value.collectionId, words })
    })
  }

  async #masterCollection(): Promise<MasterWordCollection> {
    const wordIds = (await this.#repository.listWords())
      .filter((word) => word.status === 'active' && word.eligibleForPlay)
      .map((word) => word.id)
      .sort()
    return {
      id: MASTER_WORD_COLLECTION_ID,
      name: MASTER_WORD_COLLECTION_NAME,
      normalizedName: normalizeForLookup(MASTER_WORD_COLLECTION_NAME),
      kind: 'master',
      status: 'active',
      wordIds,
    }
  }

  #timestamp(): string {
    return this.#now().toISOString()
  }
}

export function validateCatalogWordInput(
  input: unknown,
  path = 'word',
): WordCatalogResult<ValidatedWordInput> {
  if (!isRecord(input)) {
    return failure('input.invalid', path, 'Word must be an object')
  }

  const issues: WordCatalogIssue[] = []
  const term = parsePlainText(
    input.term,
    `${path}.term`,
    MAX_TERM_CHARACTERS,
    issues,
  )
  const definition = parsePlainText(
    input.definition,
    `${path}.definition`,
    MAX_DEFINITION_CHARACTERS,
    issues,
  )
  const locale = parseLocale(input.locale, `${path}.locale`, issues)
  const difficulty =
    input.difficulty === 'easy' ||
    input.difficulty === 'medium' ||
    input.difficulty === 'hard'
      ? input.difficulty
      : null
  if (difficulty === null) {
    issues.push({
      code: 'input.invalid',
      path: `${path}.difficulty`,
      message: 'Difficulty must be easy, medium, or hard',
    })
  }
  const tags = parseTags(input.tags, `${path}.tags`, locale, issues)
  const source = CATALOG_WORD_SOURCES.includes(
    input.source as CatalogWordSource,
  )
    ? (input.source as CatalogWordSource)
    : null
  if (source === null) {
    issues.push({
      code: 'input.invalid',
      path: `${path}.source`,
      message: `Source must be one of: ${CATALOG_WORD_SOURCES.join(', ')}`,
    })
  }
  const provenance = parseProvenance(input.provenance, path, issues)
  const status =
    input.status === undefined || input.status === 'active'
      ? 'active'
      : input.status === 'inactive'
        ? 'inactive'
        : null
  if (status === null) {
    issues.push({
      code: 'input.invalid',
      path: `${path}.status`,
      message: 'Status must be active or inactive',
    })
  }
  const eligibleForPlay =
    input.eligibleForPlay === undefined
      ? true
      : typeof input.eligibleForPlay === 'boolean'
        ? input.eligibleForPlay
        : null
  if (eligibleForPlay === null) {
    issues.push({
      code: 'input.invalid',
      path: `${path}.eligibleForPlay`,
      message: 'eligibleForPlay must be a boolean',
    })
  }

  if (
    source === 'model-generated' &&
    (provenance?.generator === undefined || provenance.model === undefined)
  ) {
    issues.push({
      code: 'input.invalid',
      path: `${path}.provenance`,
      message:
        'Model-generated words must identify both their generator and model',
    })
  }

  if (
    issues.length > 0 ||
    term === null ||
    definition === null ||
    locale === null ||
    difficulty === null ||
    tags === null ||
    source === null ||
    provenance === null ||
    status === null ||
    eligibleForPlay === null
  ) {
    return { ok: false, issues }
  }

  return success({
    term,
    canonicalTerm: normalizeForLookup(term, locale),
    definition,
    locale,
    difficulty,
    tags,
    source,
    provenance,
    status,
    eligibleForPlay,
  })
}

function parseImport(input: unknown): WordCatalogResult<{
  readonly collectionId: string
  readonly words: readonly ValidatedWordInput[]
}> {
  if (!isRecord(input)) {
    return failure('input.invalid', '$', 'Import must be an object')
  }

  const issues: WordCatalogIssue[] = []
  const collectionId =
    input.collectionId === undefined
      ? MASTER_WORD_COLLECTION_ID
      : parsePlainText(input.collectionId, 'collectionId', 160, issues)
  if (!Array.isArray(input.words)) {
    issues.push({
      code: 'input.invalid',
      path: 'words',
      message: 'Import words must be an array',
    })
    return { ok: false, issues }
  }
  if (input.words.length === 0 || input.words.length > MAX_IMPORT_WORDS) {
    issues.push({
      code: 'input.invalid',
      path: 'words',
      message: `Import must contain between 1 and ${MAX_IMPORT_WORDS} words`,
    })
  }

  const words: ValidatedWordInput[] = []
  const firstIndexByLocaleAndCanonicalTerm = new Map<string, number>()
  for (const [index, rawWord] of input.words
    .slice(0, MAX_IMPORT_WORDS)
    .entries()) {
    const parsed = validateCatalogWordInput(rawWord, `words[${index}]`)
    if (!parsed.ok) {
      issues.push(...parsed.issues)
      continue
    }

    const uniquenessKey = catalogWordUniquenessKey(
      parsed.value.locale,
      parsed.value.canonicalTerm,
    )
    const firstIndex = firstIndexByLocaleAndCanonicalTerm.get(uniquenessKey)
    if (firstIndex !== undefined) {
      issues.push({
        code: 'import.duplicate',
        path: `words[${index}].term`,
        message: `Canonical term duplicates words[${firstIndex}].term within ${parsed.value.locale}`,
      })
      continue
    }
    firstIndexByLocaleAndCanonicalTerm.set(uniquenessKey, index)
    words.push(parsed.value)
  }

  if (issues.length > 0 || collectionId === null) {
    return { ok: false, issues }
  }
  return success({ collectionId, words })
}

async function validateMembershipTargets(
  transaction: WordCatalogTransaction,
  collectionIds: readonly string[],
): Promise<WordCatalogResult<readonly CustomWordCollection[]>> {
  const uniqueIds = [...new Set(collectionIds)].filter(
    (id) => id !== MASTER_WORD_COLLECTION_ID,
  )
  const collections: CustomWordCollection[] = []
  const issues: WordCatalogIssue[] = []
  for (const [index, collectionId] of uniqueIds.entries()) {
    const collection = await transaction.getCustomCollection(collectionId)
    if (collection === undefined) {
      issues.push({
        code: 'collection.not-found',
        path: `collectionIds[${index}]`,
        message: 'Collection was not found',
        collectionId,
      })
      continue
    }
    if (collection.status !== 'active') {
      issues.push({
        code: 'collection.inactive',
        path: `collectionIds[${index}]`,
        message: 'Collection is inactive',
        collectionId,
      })
      continue
    }
    collections.push(collection)
  }
  return issues.length > 0 ? { ok: false, issues } : success(collections)
}

function createCatalogWord(
  id: string,
  input: ValidatedWordInput,
  timestamp: string,
): CatalogWord {
  return {
    id,
    ...input,
    tags: [...input.tags],
    provenance: { ...input.provenance },
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function appendMembership(
  collection: CustomWordCollection,
  wordId: string,
): CustomWordCollection {
  return collection.wordIds.includes(wordId)
    ? collection
    : { ...collection, wordIds: [...collection.wordIds, wordId] }
}

function removeMembership(
  collection: CustomWordCollection,
  wordId: string,
): CustomWordCollection {
  return {
    ...collection,
    wordIds: collection.wordIds.filter((candidateId) => candidateId !== wordId),
  }
}

function parsePlainText(
  input: unknown,
  path: string,
  maxCharacters: number,
  issues: WordCatalogIssue[],
): string | null {
  if (typeof input !== 'string') {
    issues.push({
      code: 'input.invalid',
      path,
      message: 'Value must be a string',
    })
    return null
  }
  const value = input.normalize('NFKC').trim().replace(/\s+/gu, ' ')
  if (
    value.length === 0 ||
    value.length > maxCharacters ||
    DISALLOWED_PLAIN_TEXT.test(value)
  ) {
    issues.push({
      code: 'input.invalid',
      path,
      message: `Value must contain 1-${maxCharacters} safe plain-text characters`,
    })
    return null
  }
  return value
}

function parseLocale(
  input: unknown,
  path: string,
  issues: WordCatalogIssue[],
): string | null {
  if (input === undefined) return 'en-US'
  if (typeof input === 'string') {
    try {
      const locales = Intl.getCanonicalLocales(input)
      if (locales.length === 1) return locales[0] ?? null
    } catch {
      // Add one stable validation issue below.
    }
  }
  issues.push({
    code: 'input.invalid',
    path,
    message: 'Locale must be a valid language tag',
  })
  return null
}

function parseTags(
  input: unknown,
  path: string,
  locale: string | null,
  issues: WordCatalogIssue[],
): readonly string[] | null {
  if (input === undefined) return []
  if (!Array.isArray(input) || input.length > MAX_TAGS) {
    issues.push({
      code: 'input.invalid',
      path,
      message: `Tags must be an array of at most ${MAX_TAGS} strings`,
    })
    return null
  }
  const values: string[] = []
  for (const [index, tag] of input.entries()) {
    const value = parsePlainText(
      tag,
      `${path}[${index}]`,
      MAX_TAG_CHARACTERS,
      issues,
    )
    if (value !== null && locale !== null) {
      values.push(normalizeForLookup(value, locale))
    }
  }
  return issues.some((issue) => issue.path.startsWith(path))
    ? null
    : [...new Set(values)]
}

function parseProvenance(
  input: unknown,
  wordPath: string,
  issues: WordCatalogIssue[],
): CatalogWordProvenance | null {
  if (input === undefined) return {}
  if (!isRecord(input)) {
    issues.push({
      code: 'input.invalid',
      path: `${wordPath}.provenance`,
      message: 'Provenance must be an object',
    })
    return null
  }

  const createdBy = parseOptionalPlainText(
    input.createdBy,
    `${wordPath}.provenance.createdBy`,
    issues,
  )
  const sourceReference = parseOptionalPlainText(
    input.sourceReference,
    `${wordPath}.provenance.sourceReference`,
    issues,
  )
  const generator = parseGeneratorIdentity(
    input.generator,
    `${wordPath}.provenance.generator`,
    issues,
  )
  const model = parseModelIdentity(
    input.model,
    `${wordPath}.provenance.model`,
    issues,
  )
  if (issues.some((issue) => issue.path.startsWith(`${wordPath}.provenance`))) {
    return null
  }
  return {
    ...(createdBy === undefined ? {} : { createdBy }),
    ...(sourceReference === undefined ? {} : { sourceReference }),
    ...(generator === undefined ? {} : { generator }),
    ...(model === undefined ? {} : { model }),
  }
}

function parseGeneratorIdentity(
  input: unknown,
  path: string,
  issues: WordCatalogIssue[],
): GeneratorIdentity | undefined {
  if (input === undefined) return undefined
  if (!isRecord(input)) {
    issues.push({
      code: 'input.invalid',
      path,
      message: 'Generator identity must be an object',
    })
    return undefined
  }
  const id = parseRequiredProvenanceField(input.id, `${path}.id`, issues)
  const version = parseRequiredProvenanceField(
    input.version,
    `${path}.version`,
    issues,
  )
  const configurationVersion = parseOptionalPlainText(
    input.configurationVersion,
    `${path}.configurationVersion`,
    issues,
  )
  if (id === null || version === null) return undefined
  return {
    id,
    version,
    ...(configurationVersion === undefined ? {} : { configurationVersion }),
  }
}

function parseModelIdentity(
  input: unknown,
  path: string,
  issues: WordCatalogIssue[],
): ModelIdentity | undefined {
  if (input === undefined) return undefined
  if (!isRecord(input)) {
    issues.push({
      code: 'input.invalid',
      path,
      message: 'Model identity must be an object',
    })
    return undefined
  }
  const id = parseRequiredProvenanceField(input.id, `${path}.id`, issues)
  const revision = parseOptionalPlainText(
    input.revision,
    `${path}.revision`,
    issues,
  )
  if (id === null) return undefined
  return { id, ...(revision === undefined ? {} : { revision }) }
}

function parseRequiredProvenanceField(
  input: unknown,
  path: string,
  issues: WordCatalogIssue[],
): string | null {
  return parsePlainText(input, path, MAX_PROVENANCE_CHARACTERS, issues)
}

function parseOptionalPlainText(
  input: unknown,
  path: string,
  issues: WordCatalogIssue[],
): string | undefined {
  if (input === undefined) return undefined
  return (
    parsePlainText(input, path, MAX_PROVENANCE_CHARACTERS, issues) ?? undefined
  )
}

function collectionNotFound(collectionId: string): WordCatalogResult<never> {
  return failure(
    'collection.not-found',
    'collectionId',
    'Collection was not found',
    { collectionId },
  )
}

function collectionInactive(collectionId: string): WordCatalogResult<never> {
  return failure(
    'collection.inactive',
    'collectionId',
    'Collection is inactive',
    { collectionId },
  )
}

function masterReadOnly(collectionId: string): WordCatalogResult<never> {
  return failure(
    'collection.master-read-only',
    'collectionId',
    'Master membership is derived from active eligible words',
    { collectionId },
  )
}

function wordNotFound(id: string): WordCatalogResult<never> {
  return failure('word.not-found', 'wordId', 'Word was not found', {
    wordId: id,
  })
}

function failure(
  code: WordCatalogIssueCode,
  path: string,
  message: string,
  context: Pick<WordCatalogIssue, 'wordId' | 'collectionId'> = {},
): WordCatalogResult<never> {
  return { ok: false, issues: [{ code, path, message, ...context }] }
}

function success<T>(value: T): WordCatalogResult<T> {
  return { ok: true, value }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function catalogWordUniquenessKey(
  locale: string,
  canonicalTerm: string,
): string {
  return `${locale}\u0000${canonicalTerm}`
}

function valueOrCurrent<T>(
  patch: Record<string, unknown>,
  key: string,
  current: T,
): unknown {
  return Object.hasOwn(patch, key) ? patch[key] : current
}
