'use client'

import {
  InMemoryWordCatalogRepository,
  MASTER_WORD_COLLECTION_ID,
  WordCatalogService,
  normalizeForLookup,
  validateCatalogWordInput,
  type CatalogWord,
  type CreateCatalogWordInput,
  type CustomWordCollection,
  type WordCatalogIssue,
  type WordCollection,
  type WordDifficulty,
} from '@drawing-games/word-bank'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'

const STORAGE_KEY = 'drawing-games.word-catalog.v1'
const SNAPSHOT_VERSION = 1 as const

const SEED_WORDS: readonly CreateCatalogWordInput[] = [
  {
    term: 'Strawberry',
    definition: 'A sweet red fruit with seeds on its surface.',
    difficulty: 'easy',
    tags: ['food', 'fruit'],
    source: 'curated',
    provenance: { sourceReference: 'local-admin-seed-v1' },
  },
  {
    term: 'Lighthouse',
    definition: 'A tower whose light helps guide ships.',
    difficulty: 'medium',
    tags: ['coast', 'building'],
    source: 'curated',
    provenance: { sourceReference: 'local-admin-seed-v1' },
  },
  {
    term: 'Volcano',
    definition: 'An opening in the earth through which lava can erupt.',
    difficulty: 'medium',
    tags: ['nature'],
    source: 'curated',
    provenance: { sourceReference: 'local-admin-seed-v1' },
  },
]

interface CatalogRuntime {
  readonly repository: InMemoryWordCatalogRepository
  readonly service: WordCatalogService
}

interface CatalogSnapshot {
  readonly version: typeof SNAPSHOT_VERSION
  readonly words: readonly CatalogWord[]
  readonly collections: readonly CustomWordCollection[]
}

type Notice = {
  readonly tone: 'success' | 'warning' | 'error'
  readonly text: string
} | null

export function WordLibraryClient() {
  const runtimeRef = useRef<CatalogRuntime | null>(null)
  const [words, setWords] = useState<readonly CatalogWord[]>([])
  const [collections, setCollections] = useState<readonly WordCollection[]>([])
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>(
    MASTER_WORD_COLLECTION_ID,
  )
  const [notice, setNotice] = useState<Notice>(null)
  const [busy, setBusy] = useState(true)
  const [importText, setImportText] = useState('')

  const refresh = useCallback(async (runtime: CatalogRuntime) => {
    const [nextWords, nextCollections] = await Promise.all([
      runtime.service.listWords(),
      runtime.service.listCollections(),
    ])
    setWords(nextWords)
    setCollections(nextCollections)
    setSelectedCollectionId((current) =>
      nextCollections.some((collection) => collection.id === current)
        ? current
        : MASTER_WORD_COLLECTION_ID,
    )
  }, [])

  useEffect(() => {
    let active = true

    void openCatalog()
      .then(async ({ runtime, warning }) => {
        if (!active) return
        runtimeRef.current = runtime
        await refresh(runtime)
        if (!active) return
        setBusy(false)
        if (warning !== null) setNotice({ tone: 'warning', text: warning })
      })
      .catch((error: unknown) => {
        if (!active) return
        setBusy(false)
        setNotice({
          tone: 'error',
          text:
            error instanceof Error
              ? error.message
              : 'The local word catalog could not be opened.',
        })
      })

    return () => {
      active = false
    }
  }, [refresh])

  async function finishMutation(
    runtime: CatalogRuntime,
    successMessage: string,
  ) {
    const persisted = await persistCatalog(runtime)
    await refresh(runtime)
    setNotice({
      tone: persisted ? 'success' : 'warning',
      text: persisted
        ? successMessage
        : `${successMessage} It worked in this tab, but browser storage could not save it.`,
    })
  }

  async function createCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const runtime = requireRuntime()
    setBusy(true)
    const result = await runtime.service.createCollection(data.get('name'))

    if (!result.ok) {
      setNotice({ tone: 'error', text: describeIssues(result.issues) })
      setBusy(false)
      return
    }

    setSelectedCollectionId(result.value.id)
    form.reset()
    await finishMutation(runtime, `Created “${result.value.name}”.`)
    setBusy(false)
  }

  async function addWord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const runtime = requireRuntime()
    const collectionId = String(
      data.get('collectionId') ?? MASTER_WORD_COLLECTION_ID,
    )
    const input: CreateCatalogWordInput = {
      term: String(data.get('term') ?? ''),
      definition: String(data.get('definition') ?? ''),
      locale: String(data.get('locale') ?? 'en-US'),
      difficulty: String(data.get('difficulty') ?? 'medium') as WordDifficulty,
      tags: parseTags(String(data.get('tags') ?? '')),
      source: 'admin',
      provenance: { createdBy: 'local-admin' },
    }

    setBusy(true)
    const result = await runtime.service.addWord(
      input,
      collectionId === MASTER_WORD_COLLECTION_ID ? [] : [collectionId],
    )
    if (!result.ok) {
      setNotice({ tone: 'error', text: describeIssues(result.issues) })
      setBusy(false)
      return
    }

    form.reset()
    await finishMutation(
      runtime,
      `Added “${result.value.term}” to the catalog.`,
    )
    setBusy(false)
  }

  async function updateWord(
    word: CatalogWord,
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const runtime = requireRuntime()
    setBusy(true)
    const result = await runtime.service.updateWord(
      word.id,
      {
        term: String(data.get('term') ?? ''),
        definition: String(data.get('definition') ?? ''),
        locale: String(data.get('locale') ?? ''),
        difficulty: String(data.get('difficulty') ?? 'medium'),
        tags: parseTags(String(data.get('tags') ?? '')),
        eligibleForPlay: data.get('eligibleForPlay') === 'on',
      },
      word.version,
    )

    if (!result.ok) {
      setNotice({ tone: 'error', text: describeIssues(result.issues) })
      setBusy(false)
      return
    }
    await finishMutation(runtime, `Updated “${result.value.term}”.`)
    setBusy(false)
  }

  async function toggleWordStatus(word: CatalogWord) {
    const runtime = requireRuntime()
    setBusy(true)
    const result = await runtime.service.updateWord(
      word.id,
      { status: word.status === 'active' ? 'inactive' : 'active' },
      word.version,
    )
    if (!result.ok) {
      setNotice({ tone: 'error', text: describeIssues(result.issues) })
      setBusy(false)
      return
    }
    await finishMutation(
      runtime,
      `${result.value.status === 'active' ? 'Activated' : 'Deactivated'} “${result.value.term}”.`,
    )
    setBusy(false)
  }

  async function deleteWord(word: CatalogWord) {
    if (!window.confirm(`Permanently delete “${word.term}”?`)) return
    const runtime = requireRuntime()
    setBusy(true)
    const result = await runtime.service.deleteWord(word.id)
    if (!result.ok) {
      setNotice({ tone: 'error', text: describeIssues(result.issues) })
      setBusy(false)
      return
    }
    await finishMutation(runtime, `Deleted “${word.term}”.`)
    setBusy(false)
  }

  async function removeFromSelectedCollection(word: CatalogWord) {
    if (selectedCollectionId === MASTER_WORD_COLLECTION_ID) return
    const runtime = requireRuntime()
    setBusy(true)
    const result = await runtime.service.removeWordFromCollection(
      word.id,
      selectedCollectionId,
    )
    if (!result.ok) {
      setNotice({ tone: 'error', text: describeIssues(result.issues) })
      setBusy(false)
      return
    }
    await finishMutation(
      runtime,
      `Removed “${word.term}” from this collection.`,
    )
    setBusy(false)
  }

  async function assignExistingWord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const wordId = String(data.get('wordId') ?? '')
    const collectionId = String(data.get('collectionId') ?? '')
    const runtime = requireRuntime()
    setBusy(true)
    const result = await runtime.service.addWordToCollection(
      wordId,
      collectionId,
    )
    if (!result.ok) {
      setNotice({ tone: 'error', text: describeIssues(result.issues) })
      setBusy(false)
      return
    }
    await finishMutation(runtime, 'Added the existing word to the collection.')
    setBusy(false)
  }

  async function importWords(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const runtime = requireRuntime()
    let parsed: unknown
    try {
      parsed = JSON.parse(importText)
    } catch {
      setNotice({ tone: 'error', text: 'Import must be valid JSON.' })
      return
    }

    const rows = Array.isArray(parsed) ? parsed : null
    if (rows === null) {
      setNotice({
        tone: 'error',
        text: 'Import JSON must be an array of words.',
      })
      return
    }

    setBusy(true)
    const result = await runtime.service.importWords({
      collectionId: selectedCollectionId,
      words: rows.map(withImportDefaults),
    })
    if (!result.ok) {
      setNotice({ tone: 'error', text: describeIssues(result.issues) })
      setBusy(false)
      return
    }

    setImportText('')
    await finishMutation(
      runtime,
      `Imported ${result.value.words.length} words atomically.`,
    )
    setBusy(false)
  }

  async function exportCatalog() {
    const snapshot = await makeSnapshot(requireRuntime())
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'drawing-games-word-catalog.json'
    link.click()
    URL.revokeObjectURL(url)
    setNotice({ tone: 'success', text: 'Exported a versioned catalog backup.' })
  }

  function requireRuntime(): CatalogRuntime {
    const runtime = runtimeRef.current
    if (runtime === null) throw new Error('Word catalog is still loading')
    return runtime
  }

  const selectedCollection =
    collections.find((collection) => collection.id === selectedCollectionId) ??
    collections[0]
  const selectedWordIds = new Set(selectedCollection?.wordIds ?? [])
  const visibleWords = words.filter((word) => selectedWordIds.has(word.id))
  const customCollections = collections.filter(
    (collection): collection is CustomWordCollection =>
      collection.kind === 'custom',
  )

  return (
    <main className="min-h-dvh bg-[#f5f0e8] text-[#181713]">
      <header className="border-b-2 border-[#181713] bg-[#f8ff80]">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:px-12">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              aria-label="Back to home"
              className="grid size-11 shrink-0 place-items-center rounded-xl border-2 border-[#181713] bg-white text-lg font-black"
            >
              ←
            </Link>
            <div className="min-w-0">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-black/50">
                Local admin tool
              </p>
              <h1 className="truncate text-xl font-black tracking-tight sm:text-2xl">
                Word library
              </h1>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void exportCatalog()}
            disabled={busy}
            className="rounded-xl border-2 border-[#181713] bg-white px-4 py-2.5 text-sm font-bold shadow-[2px_2px_0_#181713] disabled:opacity-50"
          >
            Export backup
          </button>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl gap-6 px-5 py-8 sm:px-8 lg:grid-cols-[17rem_minmax(0,1fr)] lg:px-12">
        <aside className="self-start rounded-3xl border-2 border-[#181713] bg-[#fffdf7] p-4 lg:sticky lg:top-6">
          <div className="rounded-2xl bg-[#181713] p-4 text-white">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">
              Storage boundary
            </p>
            <p className="mt-2 text-sm font-bold">Saved in this browser only</p>
            <p className="mt-1 text-xs leading-5 text-white/65">
              Export backups now. Authenticated, multi-device storage comes with
              the production admin adapter later.
            </p>
          </div>

          <nav className="mt-5" aria-label="Word collections">
            <p className="px-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-black/45">
              Collections
            </p>
            <ul className="mt-2 grid gap-1.5">
              {collections.map((collection) => (
                <li key={collection.id}>
                  <button
                    type="button"
                    aria-current={
                      collection.id === selectedCollectionId
                        ? 'page'
                        : undefined
                    }
                    onClick={() => setSelectedCollectionId(collection.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold hover:bg-black/5 aria-current:bg-[#5c4cf2] aria-current:text-white"
                  >
                    <span className="truncate">{collection.name}</span>
                    <span
                      data-testid={
                        collection.kind === 'master'
                          ? 'master-count'
                          : undefined
                      }
                      className="rounded-full bg-black/10 px-2 py-0.5 font-mono text-[10px] aria-current:bg-white/20"
                    >
                      {collection.wordIds.length}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <form
            onSubmit={createCollection}
            className="mt-5 border-t border-black/10 pt-5"
          >
            <label htmlFor="collection-name" className="text-xs font-bold">
              New custom collection
            </label>
            <div className="mt-2 grid gap-2">
              <input
                id="collection-name"
                name="name"
                placeholder="Game night"
                required
                maxLength={80}
                className="min-h-11 rounded-xl border-2 border-[#181713] bg-white px-3 text-sm outline-none focus:ring-4 focus:ring-[#5c4cf2]/20"
              />
              <button
                type="submit"
                disabled={busy}
                className="min-h-11 rounded-xl bg-[#181713] px-3 text-sm font-bold text-white disabled:opacity-50"
              >
                Create collection
              </button>
            </div>
          </form>
        </aside>

        <div className="min-w-0">
          <section className="rounded-3xl border-2 border-[#181713] bg-white/70 p-5 shadow-[5px_5px_0_#181713] sm:p-7">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#5c4cf2]">
                  {selectedCollection?.kind === 'master'
                    ? 'Derived automatically'
                    : 'Custom collection'}
                </p>
                <h2 className="mt-2 text-4xl font-black tracking-[-0.055em]">
                  {selectedCollection?.name ?? 'Loading…'}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-black/55">
                  {selectedCollection?.kind === 'master'
                    ? 'Every active, playable catalog word appears here. Add words anywhere; never edit Master membership directly.'
                    : 'Membership stores stable word IDs, so edits and deactivations stay consistent everywhere.'}
                </p>
              </div>
              <div className="grid min-w-36 grid-cols-2 gap-2 text-center">
                <Metric label="Visible" value={visibleWords.length} />
                <Metric label="All words" value={words.length} />
              </div>
            </div>

            {notice !== null && (
              <p
                role="status"
                data-tone={notice.tone}
                className="mt-5 rounded-xl border px-4 py-3 text-sm font-semibold data-[tone=error]:border-red-700/25 data-[tone=error]:bg-red-100 data-[tone=success]:border-emerald-700/20 data-[tone=success]:bg-emerald-100 data-[tone=warning]:border-amber-700/20 data-[tone=warning]:bg-amber-100"
              >
                {notice.text}
              </p>
            )}
          </section>

          <section className="mt-6 grid gap-6 xl:grid-cols-2">
            <form
              onSubmit={addWord}
              className="rounded-3xl border-2 border-[#181713] bg-[#fffdf7] p-5 sm:p-6"
            >
              <h2 className="text-2xl font-black tracking-tight">
                Add one word
              </h2>
              <p className="mt-1 text-sm text-black/50">
                A definition is required for editorial quality and
                unfamiliar-word review.
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="Word" name="term" required />
                <Field
                  label="Locale"
                  name="locale"
                  defaultValue="en-US"
                  required
                />
                <label className="grid gap-1.5 text-xs font-bold sm:col-span-2">
                  Definition
                  <textarea
                    name="definition"
                    required
                    maxLength={1000}
                    rows={3}
                    className="rounded-xl border-2 border-[#181713] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:ring-4 focus:ring-[#5c4cf2]/20"
                  />
                </label>
                <label className="grid gap-1.5 text-xs font-bold">
                  Difficulty
                  <select
                    name="difficulty"
                    defaultValue="medium"
                    className="min-h-11 rounded-xl border-2 border-[#181713] bg-white px-3 text-sm font-normal"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </label>
                <Field
                  label="Tags, comma separated"
                  name="tags"
                  placeholder="food, fruit"
                />
                <div className="rounded-xl border-2 border-dashed border-black/20 bg-[#f5f0e8] px-3 py-2.5 text-xs leading-5 sm:col-span-2">
                  <input
                    type="hidden"
                    name="collectionId"
                    value={selectedCollectionId}
                  />
                  Adding to{' '}
                  <strong>{selectedCollection?.name ?? 'Master'}</strong>. Every
                  active playable word also appears in Master automatically.
                </div>
              </div>
              <button
                type="submit"
                disabled={busy}
                className="mt-5 min-h-12 w-full rounded-xl border-2 border-[#181713] bg-[#5c4cf2] px-4 font-black text-white shadow-[2px_2px_0_#181713] disabled:opacity-50"
              >
                Add to catalog
              </button>
            </form>

            <form
              onSubmit={importWords}
              className="rounded-3xl border-2 border-[#181713] bg-[#181713] p-5 text-white sm:p-6"
            >
              <h2 className="text-2xl font-black tracking-tight">
                Atomic JSON import
              </h2>
              <p className="mt-1 text-sm leading-6 text-white/55">
                Paste an array containing term, definition, and difficulty.
                Every row validates before any row is saved.
              </p>
              <label className="mt-5 grid gap-2 text-xs font-bold">
                Words for {selectedCollection?.name ?? 'Master'}
                <textarea
                  aria-label="Import words JSON"
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                  rows={9}
                  spellCheck={false}
                  placeholder={
                    '[{"term":"Kite","definition":"A light frame flown in the wind.","difficulty":"easy"}]'
                  }
                  className="rounded-xl border border-white/25 bg-white/10 px-3 py-3 font-mono text-xs font-normal leading-5 text-white outline-none placeholder:text-white/30 focus:ring-4 focus:ring-[#f8ff80]/20"
                />
              </label>
              <button
                type="submit"
                disabled={busy || importText.trim().length === 0}
                className="mt-4 min-h-12 w-full rounded-xl bg-[#f8ff80] px-4 font-black text-[#181713] disabled:opacity-40"
              >
                Validate and import all
              </button>
            </form>
          </section>

          {customCollections.length > 0 && words.length > 0 && (
            <form
              onSubmit={assignExistingWord}
              className="mt-6 grid gap-3 rounded-2xl border-2 border-dashed border-black/25 bg-white/45 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            >
              <label className="grid gap-1.5 text-xs font-bold">
                Existing word
                <select
                  name="wordId"
                  className="min-h-11 rounded-xl border-2 border-[#181713] bg-white px-3 text-sm font-normal"
                >
                  {words.map((word) => (
                    <option key={word.id} value={word.id}>
                      {word.term}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-xs font-bold">
                Custom collection
                <select
                  name="collectionId"
                  className="min-h-11 rounded-xl border-2 border-[#181713] bg-white px-3 text-sm font-normal"
                >
                  {customCollections.map((collection) => (
                    <option key={collection.id} value={collection.id}>
                      {collection.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                disabled={busy}
                className="min-h-11 rounded-xl bg-[#181713] px-4 text-sm font-bold text-white disabled:opacity-50"
              >
                Add membership
              </button>
            </form>
          )}

          <section className="mt-6" aria-labelledby="catalog-words-heading">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-black/45">
                  Catalog records
                </p>
                <h2
                  id="catalog-words-heading"
                  className="mt-1 text-2xl font-black"
                >
                  {selectedCollection?.name ?? 'Collection'} words
                </h2>
              </div>
              {busy && (
                <span className="font-mono text-xs text-black/45">Saving…</span>
              )}
            </div>

            {visibleWords.length === 0 ? (
              <div className="mt-4 rounded-3xl border-2 border-dashed border-black/20 p-10 text-center text-sm text-black/45">
                No words are visible in this collection yet.
              </div>
            ) : (
              <div className="mt-4 grid gap-4">
                {visibleWords.map((word) => (
                  <WordCard
                    key={word.id}
                    word={word}
                    busy={busy}
                    inCustomCollection={selectedCollection?.kind === 'custom'}
                    onDelete={() => void deleteWord(word)}
                    onRemove={() => void removeFromSelectedCollection(word)}
                    onToggle={() => void toggleWordStatus(word)}
                    onUpdate={(event) => void updateWord(word, event)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}

function Metric({
  label,
  value,
}: {
  readonly label: string
  readonly value: number
}) {
  return (
    <div className="rounded-xl bg-[#f5f0e8] px-3 py-2.5">
      <p className="text-2xl font-black">{value}</p>
      <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-black/40">
        {label}
      </p>
    </div>
  )
}

interface FieldProps {
  readonly defaultValue?: string
  readonly label: string
  readonly name: string
  readonly placeholder?: string
  readonly required?: boolean
}

function Field({
  defaultValue,
  label,
  name,
  placeholder,
  required,
}: FieldProps) {
  return (
    <label className="grid gap-1.5 text-xs font-bold">
      {label}
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        className="min-h-11 rounded-xl border-2 border-[#181713] bg-white px-3 text-sm font-normal outline-none focus:ring-4 focus:ring-[#5c4cf2]/20"
      />
    </label>
  )
}

interface WordCardProps {
  readonly busy: boolean
  readonly inCustomCollection: boolean
  readonly onDelete: () => void
  readonly onRemove: () => void
  readonly onToggle: () => void
  readonly onUpdate: (event: FormEvent<HTMLFormElement>) => void
  readonly word: CatalogWord
}

function WordCard({
  busy,
  inCustomCollection,
  onDelete,
  onRemove,
  onToggle,
  onUpdate,
  word,
}: WordCardProps) {
  return (
    <article
      aria-label={`${word.term} word`}
      className="rounded-3xl border-2 border-[#181713] bg-[#fffdf7] p-5"
    >
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-2xl font-black tracking-tight">{word.term}</h3>
            <Badge>{word.locale}</Badge>
            <Badge>{word.difficulty}</Badge>
            <Badge
              tone={
                word.status === 'active' && word.eligibleForPlay
                  ? 'good'
                  : 'muted'
              }
            >
              {word.status === 'active' && word.eligibleForPlay
                ? 'playable'
                : 'not playable'}
            </Badge>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-black/60">
            {word.definition}
          </p>
          {word.tags.length > 0 && (
            <p className="mt-2 font-mono text-[10px] text-black/40">
              {word.tags.join(' · ')}
            </p>
          )}
          <p className="mt-3 font-mono text-[9px] text-black/30">
            {word.id} · version {word.version}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {inCustomCollection && (
            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              className="rounded-lg border border-black/20 px-3 py-2 text-xs font-bold disabled:opacity-50"
            >
              Remove here
            </button>
          )}
          <button
            type="button"
            onClick={onToggle}
            disabled={busy}
            className="rounded-lg border border-black/20 px-3 py-2 text-xs font-bold disabled:opacity-50"
          >
            {word.status === 'active' ? 'Deactivate' : 'Activate'}
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="rounded-lg bg-red-100 px-3 py-2 text-xs font-bold text-red-800 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>

      <details className="mt-4 border-t border-black/10 pt-4">
        <summary className="w-fit cursor-pointer text-xs font-bold text-[#5c4cf2]">
          Edit metadata
        </summary>
        <form onSubmit={onUpdate} className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Word" name="term" defaultValue={word.term} required />
          <Field
            label="Locale"
            name="locale"
            defaultValue={word.locale}
            required
          />
          <label className="grid gap-1.5 text-xs font-bold sm:col-span-2">
            Definition
            <textarea
              name="definition"
              defaultValue={word.definition}
              required
              rows={3}
              className="rounded-xl border-2 border-[#181713] bg-white px-3 py-2 text-sm font-normal"
            />
          </label>
          <label className="grid gap-1.5 text-xs font-bold">
            Difficulty
            <select
              name="difficulty"
              defaultValue={word.difficulty}
              className="min-h-11 rounded-xl border-2 border-[#181713] bg-white px-3 text-sm font-normal"
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>
          <Field label="Tags" name="tags" defaultValue={word.tags.join(', ')} />
          <label className="flex items-center gap-2 text-xs font-bold sm:col-span-2">
            <input
              type="checkbox"
              name="eligibleForPlay"
              defaultChecked={word.eligibleForPlay}
              className="size-4"
            />
            Eligible for live games
          </label>
          <button
            type="submit"
            disabled={busy}
            className="min-h-11 rounded-xl bg-[#5c4cf2] px-4 text-sm font-bold text-white disabled:opacity-50 sm:col-span-2"
          >
            Save metadata
          </button>
        </form>
      </details>
    </article>
  )
}

function Badge({
  children,
  tone = 'muted',
}: {
  readonly children: React.ReactNode
  readonly tone?: 'good' | 'muted'
}) {
  return (
    <span
      data-tone={tone}
      className="rounded-full bg-black/5 px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-black/50 data-[tone=good]:bg-emerald-100 data-[tone=good]:text-emerald-800"
    >
      {children}
    </span>
  )
}

async function openCatalog(): Promise<{
  readonly runtime: CatalogRuntime
  readonly warning: string | null
}> {
  const repository = new InMemoryWordCatalogRepository()
  const service = new WordCatalogService(repository)
  const raw = window.localStorage.getItem(STORAGE_KEY)

  if (raw !== null) {
    const snapshot = parseSnapshot(raw)
    if (snapshot !== null) {
      await repository.transaction(async (transaction) => {
        for (const word of snapshot.words) await transaction.saveWord(word)
        for (const collection of snapshot.collections) {
          await transaction.saveCustomCollection(collection)
        }
      })
      return { runtime: { repository, service }, warning: null }
    }
  }

  for (const word of SEED_WORDS) {
    const result = await service.addWord(word)
    if (!result.ok) throw new Error(describeIssues(result.issues))
  }
  const runtime = { repository, service }
  await persistCatalog(runtime)
  return {
    runtime,
    warning:
      raw === null
        ? null
        : 'The saved browser catalog was invalid, so a safe starter catalog was restored.',
  }
}

async function makeSnapshot(runtime: CatalogRuntime): Promise<CatalogSnapshot> {
  const [words, collections] = await Promise.all([
    runtime.repository.listWords(),
    runtime.repository.listCustomCollections(),
  ])
  return { version: SNAPSHOT_VERSION, words, collections }
}

async function persistCatalog(runtime: CatalogRuntime): Promise<boolean> {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(await makeSnapshot(runtime)),
    )
    return true
  } catch {
    return false
  }
}

function parseSnapshot(raw: string): CatalogSnapshot | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(value) || value.version !== SNAPSHOT_VERSION) return null
  if (!Array.isArray(value.words) || !Array.isArray(value.collections))
    return null

  const words = value.words.filter(isStoredWord)
  const collections = value.collections.filter(isStoredCollection)
  if (
    words.length !== value.words.length ||
    collections.length !== value.collections.length
  )
    return null

  const wordIds = new Set(words.map((word) => word.id))
  const wordKeys = new Set(
    words.map((word) => `${word.locale}\u0000${word.canonicalTerm}`),
  )
  const collectionIds = new Set(collections.map((collection) => collection.id))
  const collectionNames = new Set(
    collections.map((collection) => collection.normalizedName),
  )
  if (wordIds.size !== words.length || wordKeys.size !== words.length)
    return null
  if (
    collectionIds.size !== collections.length ||
    collectionNames.size !== collections.length
  )
    return null
  if (
    collections.some((collection) =>
      collection.wordIds.some((id) => !wordIds.has(id)),
    )
  )
    return null

  return { version: SNAPSHOT_VERSION, words, collections }
}

function isStoredWord(value: unknown): value is CatalogWord {
  if (!isRecord(value)) return false
  const parsed = validateCatalogWordInput(value)
  return (
    parsed.ok &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    value.canonicalTerm === parsed.value.canonicalTerm &&
    value.locale === parsed.value.locale &&
    Number.isSafeInteger(value.version) &&
    Number(value.version) > 0 &&
    typeof value.createdAt === 'string' &&
    Number.isFinite(Date.parse(value.createdAt)) &&
    typeof value.updatedAt === 'string' &&
    Number.isFinite(Date.parse(value.updatedAt))
  )
}

function isStoredCollection(value: unknown): value is CustomWordCollection {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    value.id !== MASTER_WORD_COLLECTION_ID &&
    typeof value.name === 'string' &&
    value.name.trim().length > 0 &&
    value.normalizedName === normalizeForLookup(value.name) &&
    value.kind === 'custom' &&
    (value.status === 'active' || value.status === 'inactive') &&
    Array.isArray(value.wordIds) &&
    value.wordIds.every((id) => typeof id === 'string') &&
    new Set(value.wordIds).size === value.wordIds.length
  )
}

function withImportDefaults(value: unknown): unknown {
  if (!isRecord(value)) return value
  return {
    ...value,
    locale: value.locale ?? 'en-US',
    tags: value.tags ?? [],
    source: value.source ?? 'imported',
    provenance: value.provenance ?? { sourceReference: 'local-admin-json' },
  }
}

function describeIssues(issues: readonly WordCatalogIssue[]): string {
  return issues
    .slice(0, 4)
    .map((issue) => `${issue.path}: ${issue.message}`)
    .join(' · ')
}

function parseTags(value: string): readonly string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
