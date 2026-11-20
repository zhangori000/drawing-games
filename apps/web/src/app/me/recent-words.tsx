'use client'

import type { WordHistoryEvent } from '@drawing-games/game-core'
import { getWordPackName } from '@drawing-games/word-bank'
import { useState } from 'react'

import { Badge, Chip, type BadgeTone } from '@/components/ui/badge'
import {
  WORD_ROLE_FILTERS,
  WORD_ROLE_LABELS,
  describeWordResult,
  formatRelativeTime,
  matchesRoleFilter,
  wordEventContext,
  type WordRoleFilter,
} from '@/lib/account/stats'
import { useNow } from '@/lib/use-now'

const DIFFICULTY_TONE: Readonly<Record<string, BadgeTone>> = {
  easy: 'green',
  medium: 'lime',
  hard: 'coral',
}

export function RecentWords({
  words,
}: {
  readonly words: readonly WordHistoryEvent[]
}) {
  const [filter, setFilter] = useState<WordRoleFilter>('all')
  const now = useNow()
  const visible = words.filter((word) => matchesRoleFilter(word, filter))

  return (
    <section aria-labelledby="words-heading" className="mt-10">
      <h2 id="words-heading" className="text-2xl font-black tracking-[-0.03em]">
        Recent words
      </h2>
      <div
        role="group"
        aria-label="Filter words by role"
        className="mt-4 flex gap-2 overflow-x-auto pb-1"
      >
        {WORD_ROLE_FILTERS.map((option) => (
          <Chip
            key={option.id}
            selected={filter === option.id}
            onClick={() => setFilter(option.id)}
          >
            {option.label}
          </Chip>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="mt-4 rounded-2xl border-2 border-dashed border-black/20 p-6 text-center text-black/55">
          {words.length === 0
            ? 'Play a match and your words will show up here.'
            : 'No words with this role yet.'}
        </p>
      ) : (
        <ul className="mt-4 divide-y-2 divide-black/5 overflow-hidden rounded-2xl border-2 border-[#181713] bg-white">
          {visible.slice(0, 100).map((word, index) => {
            const context = wordEventContext(word)
            return (
              <li
                key={`${word.wordId}-${word.role}-${word.atMs}-${index}`}
                data-testid="word-row"
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto]"
              >
                <div className="min-w-0">
                  <p className="truncate text-lg font-black">{word.term}</p>
                  <p className="truncate text-xs text-black/50">
                    {getWordPackName(word.packId)}
                  </p>
                </div>
                <p className="order-3 col-span-2 text-sm text-black/65 sm:order-none sm:col-span-1">
                  {context === null ? null : (
                    <Badge tone="violet" className="mr-1.5 align-[1px]">
                      {context}
                    </Badge>
                  )}
                  <span className="font-bold text-[#181713]">
                    {WORD_ROLE_LABELS[word.role] ?? word.role}
                  </span>
                  {' · '}
                  {describeWordResult(word)}
                </p>
                <Badge tone={DIFFICULTY_TONE[word.difficulty] ?? 'neutral'}>
                  {word.difficulty}
                </Badge>
                <time
                  dateTime={new Date(word.atMs).toISOString()}
                  className="hidden text-right text-xs text-black/45 sm:block"
                >
                  {now > 0 ? formatRelativeTime(word.atMs, now) : ''}
                </time>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
