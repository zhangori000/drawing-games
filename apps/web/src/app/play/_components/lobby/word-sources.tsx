'use client'

import { useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import { cx } from '@/components/ui/cx'

import {
  CUSTOM_WORD_LIMITS,
  formatCustomWords,
  parseCustomWords,
} from '../../_lib/custom-words'
import { plural } from '../../_lib/format'
import { minimumCustomWordsForOnly } from '../../_lib/settings-options'
import type { SettingsDraft } from '../../_lib/use-settings-draft'
import { useRoomSession } from '../room-session'
import { Toggle } from '../shared/controls'
import { Card } from '../shared/layout'
import { LibraryImport } from './library-import'

/** Word packs, freshness, and the host's own words. */
export function WordSources({
  draft,
  editable,
}: {
  readonly draft: SettingsDraft
  readonly editable: boolean
}) {
  const { packs, view } = useRoomSession()
  const settings = draft.settings
  const enabled = new Set(settings.packIds)
  const lobby = view.lobby
  const onlyCustom = settings.customWordsMode === 'only'

  const togglePack = (packId: string) => {
    const next = enabled.has(packId)
      ? settings.packIds.filter((id) => id !== packId)
      : [...settings.packIds, packId]
    draft.update({ packIds: next })
  }

  return (
    <Card labelledBy="word-sources-heading" className="grid gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3
          id="word-sources-heading"
          className="text-lg font-black tracking-[-0.02em]"
        >
          Words
        </h3>
        {lobby ? (
          <p
            data-testid="fresh-words"
            className={cx(
              'rounded-full border-2 border-[#181713] px-3 py-1 text-sm font-black',
              lobby.freshWordCount <
                settings.rounds * settings.wordChoiceCount * 2
                ? 'bg-[#ffd9cf]'
                : 'bg-[#f8ff80]',
            )}
          >
            {lobby.freshWordCount} fresh words for this group
            <span className="font-semibold text-black/55">
              {' '}
              · {lobby.poolSize} in play
            </span>
          </p>
        ) : null}
      </div>
      <p className="-mt-3 text-sm leading-6 text-black/60">
        Fresh means nobody here has drawn, guessed, or skipped it lately. Words
        never repeat inside this room.
      </p>

      <fieldset className={cx('grid gap-2', onlyCustom && 'opacity-60')}>
        <legend className="mb-2 text-sm font-black">
          Word packs
          {onlyCustom ? (
            <span className="font-semibold text-black/55">
              {' '}
              (off: only custom words)
            </span>
          ) : null}
        </legend>
        <div className="flex flex-wrap gap-2">
          {packs.map((pack) => {
            const on = enabled.has(pack.id)
            return (
              <button
                key={pack.id}
                type="button"
                aria-pressed={on}
                aria-disabled={!editable || undefined}
                title={pack.description}
                onClick={() => {
                  if (editable) togglePack(pack.id)
                }}
                className={cx(
                  'inline-flex min-h-11 items-center gap-2 rounded-full border-2 px-3.5 text-sm font-black transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5c4cf2]/35',
                  on
                    ? 'border-[#181713] bg-[#181713] text-white'
                    : 'border-black/15 bg-white text-black/65',
                  editable && !on && 'hover:border-[#181713]',
                  !editable && 'cursor-default',
                  !editable && !on && 'opacity-55',
                )}
              >
                <span aria-hidden="true">{on ? '✓' : '+'}</span>
                {pack.name}
                <span
                  className={cx(
                    'font-mono text-xs tabular-nums',
                    on ? 'text-white/70' : 'text-black/45',
                  )}
                >
                  {pack.wordCount}
                  <span className="sr-only"> words</span>
                </span>
                {pack.kidFriendly ? (
                  <span
                    className={cx(
                      'rounded-full px-1.5 text-[10px] font-black uppercase tracking-wider',
                      on
                        ? 'bg-[#f8ff80] text-[#181713]'
                        : 'bg-[#d8f3e7] text-[#0d5c41]',
                    )}
                  >
                    Kid-friendly
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </fieldset>

      <CustomWords draft={draft} editable={editable} />
    </Card>
  )
}

function CustomWords({
  draft,
  editable,
}: {
  readonly draft: SettingsDraft
  readonly editable: boolean
}) {
  const id = useId()
  const settings = draft.settings
  // null while not editing: show the room's list, one word per line.
  const [text, setText] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const shown = text ?? formatCustomWords(settings.customWords)
  const parsed = parseCustomWords(shown)
  const count =
    text === null ? settings.customWords.length : parsed.words.length
  const needed = minimumCustomWordsForOnly(settings.wordChoiceCount)
  const onlyCustom = settings.customWordsMode === 'only'

  if (!editable) {
    return (
      <div className="grid gap-1 rounded-2xl bg-black/[0.04] px-4 py-3 text-sm">
        <p className="font-black">
          {count > 0 ? plural(count, 'custom word') : 'No custom words'}
          {count > 0 && onlyCustom ? ' · only these words are used' : ''}
        </p>
        {count > 0 ? (
          <p className="text-black/55">
            The host’s words stay hidden so they’re still a surprise.
          </p>
        ) : null}
      </div>
    )
  }

  const notes: string[] = []
  if (parsed.invalid > 0) {
    notes.push(
      `${plural(parsed.invalid, 'entry', 'entries')} skipped (${CUSTOM_WORD_LIMITS.minLength}–${CUSTOM_WORD_LIMITS.maxLength} characters)`,
    )
  }
  if (parsed.duplicates > 0)
    notes.push(`${plural(parsed.duplicates, 'repeat')} removed`)
  if (parsed.overLimit > 0) {
    notes.push(`only the first ${CUSTOM_WORD_LIMITS.maxCount} are kept`)
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={`${id}-words`} className="text-sm font-black">
          Custom words
        </label>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setImporting(true)}
        >
          Import from Word Library
        </Button>
      </div>
      <textarea
        id={`${id}-words`}
        value={shown}
        rows={4}
        onChange={(event) => {
          setText(event.target.value)
          draft.update({
            customWords: parseCustomWords(event.target.value).words,
          })
        }}
        onBlur={() => {
          void draft.flush().finally(() => setText(null))
        }}
        placeholder="Comma or one per line: grandma’s car, pizza night, Mr. Whiskers"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-describedby={`${id}-count`}
        className="min-h-28 w-full resize-y rounded-2xl border-2 border-[#181713] bg-white px-4 py-3 text-base leading-6 outline-none placeholder:text-black/35 focus:ring-4 focus:ring-[#5c4cf2]/25"
      />
      <p
        id={`${id}-count`}
        className="text-xs leading-5 text-black/55"
        aria-live="polite"
      >
        <strong className="text-[#181713]">{plural(count, 'word')}</strong> · up
        to {CUSTOM_WORD_LIMITS.maxCount}
        {notes.length > 0 ? ` · ${notes.join(' · ')}` : ''}
      </p>
      <Toggle
        label="Use only my words"
        description={
          count >= needed || onlyCustom
            ? 'Skip the packs and draft only from your list.'
            : `Add at least ${needed} words (two drafts’ worth) to use only yours.`
        }
        checked={onlyCustom}
        readOnly={!onlyCustom && count < needed}
        onChange={(value) =>
          draft.update({ customWordsMode: value ? 'only' : 'mix' })
        }
      />
      <LibraryImport
        open={importing}
        onClose={() => setImporting(false)}
        existing={settings.customWords}
        onImport={(words) => {
          setText(null)
          draft.update({ customWords: words })
        }}
      />
    </div>
  )
}
