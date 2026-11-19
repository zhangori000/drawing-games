'use client'

import Link from 'next/link'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { cx } from '@/components/ui/cx'
import { Modal } from '@/components/ui/modal'

import { mergeCustomWords } from '../../_lib/custom-words'
import { plural } from '../../_lib/format'
import {
  readWordLibrary,
  type LibraryCollection,
} from '../../_lib/word-library'

export interface LibraryImportProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly existing: readonly string[]
  /** The merged custom-word list (existing words first). */
  readonly onImport: (words: readonly string[]) => void
}

/** Adds the active words of a Word Library collection to the custom words. */
export function LibraryImport({
  open,
  onClose,
  existing,
  onImport,
}: LibraryImportProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import from Word Library"
      description="Words from the library saved in this browser. Only active words are added, and repeats are skipped."
    >
      {open ? (
        <LibraryPicker
          existing={existing}
          onCancel={onClose}
          onImport={(words) => {
            onImport(words)
            onClose()
          }}
        />
      ) : null}
    </Modal>
  )
}

function LibraryPicker({
  existing,
  onCancel,
  onImport,
}: {
  readonly existing: readonly string[]
  readonly onCancel: () => void
  readonly onImport: (words: readonly string[]) => void
}) {
  // Read once when the dialog opens; the library lives in localStorage.
  const [library] = useState<LibraryCollection[] | null>(readWordLibrary)
  const [selectedId, setSelectedId] = useState<string | null>(
    () =>
      library?.find(
        (entry) => entry.kind === 'custom' && entry.terms.length > 0,
      )?.id ??
      library?.[0]?.id ??
      null,
  )

  if (!library) {
    return (
      <div className="grid gap-4">
        <p className="text-sm leading-6 text-black/65">
          No Word Library is saved in this browser yet. Build collections in the
          Word Library, then come back to import them.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Link
            href="/admin/words"
            target="_blank"
            className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-black text-[#5c4cf2] underline underline-offset-4"
          >
            Open Word Library
          </Link>
          <Button variant="secondary" onClick={onCancel}>
            Close
          </Button>
        </div>
      </div>
    )
  }

  const selected = library.find((entry) => entry.id === selectedId) ?? null
  const merged = selected ? mergeCustomWords(existing, selected.terms) : null

  return (
    <div className="grid gap-4">
      <fieldset className="grid max-h-[45dvh] gap-2 overflow-y-auto overscroll-contain pr-1">
        <legend className="sr-only">Collection</legend>
        {library.map((collection) => {
          const checked = collection.id === selectedId
          const empty = collection.terms.length === 0
          return (
            <label
              key={collection.id}
              className={cx(
                'flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border-2 px-3 py-2 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[#5c4cf2]/35',
                checked
                  ? 'border-[#181713] bg-[#f8ff80]'
                  : 'border-black/15 bg-white',
                empty && 'cursor-not-allowed opacity-50',
              )}
            >
              <input
                type="radio"
                name="library-collection"
                value={collection.id}
                checked={checked}
                disabled={empty}
                onChange={() => setSelectedId(collection.id)}
                className="size-5 accent-[#181713]"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-black">
                  {collection.name}
                </span>
                <span className="block text-xs text-black/55">
                  {collection.kind === 'master'
                    ? 'Every active word in the library'
                    : 'Custom collection'}
                </span>
              </span>
              <span className="shrink-0 font-mono text-sm font-black tabular-nums">
                {collection.terms.length}
              </span>
            </label>
          )
        })}
      </fieldset>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <p className="mr-auto text-sm text-black/60" aria-live="polite">
          {merged
            ? merged.addedCount > 0
              ? `${plural(merged.addedCount, 'new word')} to add`
              : 'Nothing new to add'
            : ''}
        </p>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          disabled={!merged || merged.addedCount === 0}
          onClick={() => {
            if (merged) onImport(merged.words)
          }}
        >
          Add words
        </Button>
      </div>
    </div>
  )
}
