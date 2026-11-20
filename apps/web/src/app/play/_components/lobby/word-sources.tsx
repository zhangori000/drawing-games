'use client'

import { useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import { cx } from '@/components/ui/cx'

import {
  CUSTOM_WORD_LIMITS,
  formatCustomWords,
  formatWithSkipped,
  parseCustomWords,
  sameWordList,
  type SkippedCustomWord,
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
        Fresh means nobody here has drawn, guessed, or skipped it lately.
        {lobby && lobby.repeatsFromRound === null
          ? ' Words drawn in this room never come back.'
          : null}
      </p>
      {lobby && lobby.repeatsFromRound !== null ? (
        <p
          role="status"
          data-testid="repeat-warning"
          className="-mt-2 rounded-2xl border-2 border-[#181713] bg-[#ffd9cf] px-4 py-3 text-sm leading-6"
        >
          <strong className="font-black">Words will repeat.</strong> This room
          has {plural(lobby.unusedWordCount, 'word')} it hasn’t drawn yet, so{' '}
          {lobby.repeatsFromRound === 1
            ? 'from the first round'
            : `from round ${lobby.repeatsFromRound}`}{' '}
          some cards may be words already drawn here (the drawer sees them
          marked).{' '}
          {onlyCustom
            ? 'Add more custom words, mix them with packs, or play fewer rounds.'
            : 'Turn on more packs, add custom words, or play fewer rounds.'}
        </p>
      ) : null}

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
  const { view } = useRoomSession()
  const settings = draft.settings
  const saved = settings.customWords
  // The host's own text, exactly as typed (skipped entries included), or
  // null to show the room's list one word per line.
  const [text, setText] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)
  const [importing, setImporting] = useState(false)
  const typed = text === null ? null : parseCustomWords(text)
  // After blur the text stays, so a mistyped entry and the "skipped" note
  // are still there to fix, for as long as it still describes the saved
  // list. A change from elsewhere (another tab, a refused edit) replaces it.
  const keepText =
    typed !== null && (focused || sameWordList(typed.words, saved))
  if (text !== null && !keepText) setText(null)
  const shown = keepText && text !== null ? text : formatCustomWords(saved)
  const parsed = keepText && typed !== null ? typed : parseCustomWords(shown)
  const count = keepText ? parsed.words.length : saved.length
  const needed = minimumCustomWordsForOnly(settings.wordChoiceCount)
  const onlyCustom = settings.customWordsMode === 'only'

  if (!editable) {
    // The room never sends other players the host's words, only how many.
    const hidden = view.settings.customWordCount
    return (
      <div className="grid gap-1 rounded-2xl bg-black/[0.04] px-4 py-3 text-sm">
        <p className="font-black" data-testid="custom-word-count">
          {hidden > 0 ? plural(hidden, 'custom word') : 'No custom words'}
          {hidden > 0 && onlyCustom ? ' · only these words are used' : ''}
        </p>
        {hidden > 0 ? (
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
      `${plural(parsed.invalid, 'entry', 'entries')} skipped (${CUSTOM_WORD_LIMITS.minLength}–${CUSTOM_WORD_LIMITS.maxLength} characters${skippedList(parsed.skipped, 'length')})`,
    )
  }
  if (parsed.badTags > 0) {
    notes.push(
      `${plural(parsed.badTags, 'entry', 'entries')} skipped (tag with |easy, |medium or |hard${skippedList(parsed.skipped, 'tag')})`,
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
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          void draft.flush()
        }}
        placeholder="Comma or one per line: grandma’s car, pizza night|easy, Mr. Whiskers|hard"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-describedby={`${id}-count ${id}-tags`}
        className="min-h-28 w-full resize-y rounded-2xl border-2 border-[#181713] bg-white px-4 py-3 text-base leading-6 outline-none placeholder:text-black/35 focus:ring-4 focus:ring-[#5c4cf2]/25"
      />
      <p
        id={`${id}-count`}
        data-testid="custom-words-note"
        className={cx(
          'text-xs leading-5',
          parsed.skipped.length > 0
            ? 'rounded-xl bg-[#ffd9cf] px-3 py-1.5 text-[#181713]'
            : 'text-black/55',
        )}
        aria-live="polite"
      >
        <strong className="text-[#181713]">{plural(count, 'word')}</strong> · up
        to {CUSTOM_WORD_LIMITS.maxCount}
        {notes.length > 0 ? ` · ${notes.join(' · ')}` : ''}
      </p>
      <p id={`${id}-tags`} className="-mt-2 text-xs leading-5 text-black/55">
        Add <code className="font-mono font-black">|easy</code>,{' '}
        <code className="font-mono font-black">|medium</code> or{' '}
        <code className="font-mono font-black">|hard</code> after a word to set
        its bonus, so drafts mix easy and hard cards. Words without one show as
        “Custom” and score like medium (+20).
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
          // Keep any entries the host still has to fix below the new list.
          setText(
            parsed.skipped.length > 0
              ? formatWithSkipped(words, parsed.skipped)
              : null,
          )
          draft.update({ customWords: words })
        }}
      />
    </div>
  )
}

/** `: “tree house|mediun”, “x”` for the note (at most three, then "…"). */
function skippedList(
  skipped: readonly SkippedCustomWord[],
  reason: SkippedCustomWord['reason'],
): string {
  const entries = skipped
    .filter((item) => item.reason === reason)
    .map((item) => item.entry)
  if (entries.length === 0) return ''
  const shown = entries.slice(0, 3).map((entry) => `“${entry}”`)
  return `: ${shown.join(', ')}${entries.length > 3 ? ', …' : ''}`
}
