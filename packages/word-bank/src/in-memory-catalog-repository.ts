import type {
  CatalogWord,
  CustomWordCollection,
  WordCatalogRepository,
  WordCatalogTransaction,
} from './catalog'

interface RepositoryState {
  readonly words: Map<string, CatalogWord>
  readonly collections: Map<string, CustomWordCollection>
}

/**
 * Transactional test/development adapter. Production storage only needs to
 * implement the same domain-owned repository port.
 */
export class InMemoryWordCatalogRepository implements WordCatalogRepository {
  #state: RepositoryState = { words: new Map(), collections: new Map() }
  #transactionTail: Promise<void> = Promise.resolve()

  async getWord(id: string): Promise<CatalogWord | undefined> {
    await this.#transactionTail
    return cloneWord(this.#state.words.get(id))
  }

  async findWordByLocaleAndCanonicalTerm(
    locale: string,
    canonicalTerm: string,
  ): Promise<CatalogWord | undefined> {
    await this.#transactionTail
    return findByLocaleAndCanonicalTerm(this.#state, locale, canonicalTerm)
  }

  async listWords(): Promise<readonly CatalogWord[]> {
    await this.#transactionTail
    return [...this.#state.words.values()].map((word) => cloneWord(word)!)
  }

  async getCustomCollection(
    id: string,
  ): Promise<CustomWordCollection | undefined> {
    await this.#transactionTail
    return cloneCollection(this.#state.collections.get(id))
  }

  async findCustomCollectionByNormalizedName(
    normalizedName: string,
  ): Promise<CustomWordCollection | undefined> {
    await this.#transactionTail
    return findByNormalizedName(this.#state, normalizedName)
  }

  async listCustomCollections(): Promise<readonly CustomWordCollection[]> {
    await this.#transactionTail
    return [...this.#state.collections.values()].map((collection) =>
      cloneCollection(collection)!,
    )
  }

  async transaction<T>(
    work: (transaction: WordCatalogTransaction) => Promise<T>,
  ): Promise<T> {
    const previous = this.#transactionTail
    let release!: () => void
    this.#transactionTail = new Promise<void>((resolve) => {
      release = resolve
    })

    await previous
    const draft = cloneState(this.#state)
    try {
      const result = await work(createTransaction(draft))
      this.#state = draft
      return result
    } finally {
      release()
    }
  }
}

function createTransaction(state: RepositoryState): WordCatalogTransaction {
  return {
    async getWord(id) {
      return cloneWord(state.words.get(id))
    },
    async findWordByLocaleAndCanonicalTerm(locale, canonicalTerm) {
      return findByLocaleAndCanonicalTerm(state, locale, canonicalTerm)
    },
    async listWords() {
      return [...state.words.values()].map((word) => cloneWord(word)!)
    },
    async saveWord(word) {
      state.words.set(word.id, cloneWord(word)!)
    },
    async deleteWord(id) {
      state.words.delete(id)
    },
    async getCustomCollection(id) {
      return cloneCollection(state.collections.get(id))
    },
    async findCustomCollectionByNormalizedName(normalizedName) {
      return findByNormalizedName(state, normalizedName)
    },
    async listCustomCollections() {
      return [...state.collections.values()].map((collection) =>
        cloneCollection(collection)!,
      )
    },
    async saveCustomCollection(collection) {
      state.collections.set(collection.id, cloneCollection(collection)!)
    },
  }
}

function findByLocaleAndCanonicalTerm(
  state: RepositoryState,
  locale: string,
  canonicalTerm: string,
): CatalogWord | undefined {
  return cloneWord(
    [...state.words.values()].find(
      (word) => word.locale === locale && word.canonicalTerm === canonicalTerm,
    ),
  )
}

function findByNormalizedName(
  state: RepositoryState,
  normalizedName: string,
): CustomWordCollection | undefined {
  return cloneCollection(
    [...state.collections.values()].find(
      (collection) => collection.normalizedName === normalizedName,
    ),
  )
}

function cloneState(state: RepositoryState): RepositoryState {
  return {
    words: new Map(
      [...state.words].map(([id, word]) => [id, cloneWord(word)!]),
    ),
    collections: new Map(
      [...state.collections].map(([id, collection]) => [
        id,
        cloneCollection(collection)!,
      ]),
    ),
  }
}

function cloneWord(word: CatalogWord | undefined): CatalogWord | undefined {
  if (word === undefined) return undefined
  return {
    ...word,
    tags: [...word.tags],
    provenance: {
      ...word.provenance,
      ...(word.provenance.generator === undefined
        ? {}
        : { generator: { ...word.provenance.generator } }),
      ...(word.provenance.model === undefined
        ? {}
        : { model: { ...word.provenance.model } }),
    },
  }
}

function cloneCollection(
  collection: CustomWordCollection | undefined,
): CustomWordCollection | undefined {
  return collection === undefined
    ? undefined
    : { ...collection, wordIds: [...collection.wordIds] }
}
