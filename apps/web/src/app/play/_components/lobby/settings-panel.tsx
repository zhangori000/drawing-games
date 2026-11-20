'use client'

import {
  ownWordCluesAllowed,
  type RoomSettings,
} from '@drawing-games/game-core'
import type { ReactNode } from 'react'

import { formatSeconds } from '../../_lib/format'
import {
  CLUES_OFF_WITH_CARDS,
  DIFFICULTY_MIX_CHOICES,
  DRAWING_SECONDS_CHOICES,
  HINT_COST_STEPPER,
  HINT_UNLOCK_STEPPER,
  REPLACEMENT_CHOICES,
  RESULTS_STEPPER,
  ROUND_CHOICES,
  SHOWDOWN_SECONDS_CHOICES,
  VISIBILITY_CHOICES,
  WORD_CHOICE_COUNT_CHOICES,
  WORD_DRAFT_STEPPER,
  WORD_LENGTH_CHOICES,
  type Choice,
} from '../../_lib/settings-options'
import type { SettingsDraft } from '../../_lib/use-settings-draft'
import { ChoiceGroup, Stepper, Toggle } from '../shared/controls'
import { Card, Eyebrow } from '../shared/layout'
import { WordSources } from './word-sources'

function numberChoices(
  values: readonly number[],
  label: (value: number) => string = String,
): Choice<number>[] {
  return values.map((value) => ({ value, label: label(value) }))
}

const ROUNDS = numberChoices(ROUND_CHOICES)
const DRAWING_SECONDS = numberChoices(
  DRAWING_SECONDS_CHOICES,
  (value) => `${value}s`,
)
const WORD_CHOICES = numberChoices(WORD_CHOICE_COUNT_CHOICES)
const REPLACEMENTS = numberChoices(REPLACEMENT_CHOICES)
const SHOWDOWN_SECONDS = numberChoices(SHOWDOWN_SECONDS_CHOICES, formatSeconds)

/**
 * Every room setting. The host edits (debounced into patches); everyone
 * else sees the same values read-only, so nobody is surprised at Start.
 */
export function SettingsPanel({
  draft,
  editable,
}: {
  readonly draft: SettingsDraft
  readonly editable: boolean
}) {
  const settings = draft.settings
  const readOnly = !editable
  // Kept as chosen, but not used while opponents see the draft cards.
  const clues = ownWordCluesAllowed(settings)
  const set = <K extends keyof RoomSettings>(key: K, value: RoomSettings[K]) =>
    draft.update({ [key]: value } as Pick<RoomSettings, K>)

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2 px-1">
        <div>
          <Eyebrow>Room settings</Eyebrow>
          <h2 className="text-2xl font-black tracking-[-0.03em]">
            How you’ll play
          </h2>
        </div>
        <p className="text-sm font-semibold text-black/55" aria-live="polite">
          {editable
            ? draft.saving
              ? 'Saving…'
              : 'Changes save automatically.'
            : 'Only the host can change these.'}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Match">
          <ChoiceGroup
            label="Rounds"
            value={settings.rounds}
            choices={ROUNDS}
            readOnly={readOnly}
            onChange={(value) => set('rounds', value)}
            hint={`Both teams draw at the same time, ${settings.rounds} words each.`}
          />
          <ChoiceGroup
            label="Drawing time"
            value={settings.drawingSeconds}
            choices={DRAWING_SECONDS}
            readOnly={readOnly}
            onChange={(value) => set('drawingSeconds', value)}
          />
          <Toggle
            label="Showdown finale"
            description="Relay: redraw your team’s words. +10 per card, +20 for the first team to finish."
            checked={settings.showdown}
            readOnly={readOnly}
            onChange={(value) => set('showdown', value)}
          />
          {settings.showdown ? (
            <ChoiceGroup
              label="Showdown length"
              value={settings.showdownSeconds}
              choices={SHOWDOWN_SECONDS}
              readOnly={readOnly}
              onChange={(value) => set('showdownSeconds', value)}
            />
          ) : null}
        </Section>

        <Section title="Word draft">
          <ChoiceGroup
            label="Difficulty mix"
            value={settings.difficultyMix}
            choices={DIFFICULTY_MIX_CHOICES}
            readOnly={readOnly}
            onChange={(value) => set('difficultyMix', value)}
          />
          <ChoiceGroup
            label="Cards per draft"
            value={settings.wordChoiceCount}
            choices={WORD_CHOICES}
            readOnly={readOnly}
            onChange={(value) => set('wordChoiceCount', value)}
          />
          <ChoiceGroup
            label="Swaps per drawer"
            value={settings.replacementsPerDrawer}
            choices={REPLACEMENTS}
            readOnly={readOnly}
            onChange={(value) => set('replacementsPerDrawer', value)}
            hint="“Seen it” and “Don’t know it” share this allowance. Drawers can read a definition first."
          />
          <ChoiceGroup
            label="Opponents see the draft"
            value={settings.opponentDraftVisibility}
            choices={VISIBILITY_CHOICES}
            readOnly={readOnly}
            onChange={(value) => set('opponentDraftVisibility', value)}
          />
        </Section>

        <Section title="Clues">
          {clues ? null : (
            <p
              data-testid="clues-off"
              className="-mt-2 rounded-2xl bg-[#ffd9cf] px-3 py-2 text-sm font-semibold leading-6"
            >
              {CLUES_OFF_WITH_CARDS} Pick “Swaps only” to bring them back.
            </p>
          )}
          <ChoiceGroup
            label="Word length"
            value={settings.wordLengthMode}
            choices={WORD_LENGTH_CHOICES}
            readOnly={readOnly || !clues}
            onChange={(value) => set('wordLengthMode', value)}
            hint={clues ? undefined : 'Not used with “Cards + swaps”.'}
          />
          {clues && settings.wordLengthMode === 'hidden-vote' ? (
            <>
              <Stepper
                label="Vote opens after"
                value={settings.hintUnlockSeconds}
                spec={HINT_UNLOCK_STEPPER}
                readOnly={readOnly}
                format={(value) => `${value}s`}
                onChange={(value) => set('hintUnlockSeconds', value)}
              />
              <Stepper
                label="Reveal costs"
                value={settings.hintCost}
                spec={HINT_COST_STEPPER}
                readOnly={readOnly}
                format={(value) => `${value} pts`}
                onChange={(value) => set('hintCost', value)}
              />
            </>
          ) : null}
          <Toggle
            label="Category hint"
            description={
              clues
                ? 'Guessers see which pack their word came from, like “Animals”.'
                : 'Not used with “Cards + swaps”.'
            }
            checked={settings.categoryHint}
            readOnly={readOnly || !clues}
            onChange={(value) => set('categoryHint', value)}
          />
        </Section>

        <Section title="Timing">
          <Stepper
            label="Word pick time"
            value={settings.wordDraftSeconds}
            spec={WORD_DRAFT_STEPPER}
            readOnly={readOnly}
            format={(value) => `${value}s`}
            onChange={(value) => set('wordDraftSeconds', value)}
          />
          <Stepper
            label="Results screen"
            value={settings.roundResultsSeconds}
            spec={RESULTS_STEPPER}
            readOnly={readOnly}
            format={(value) => `${value}s`}
            onChange={(value) => set('roundResultsSeconds', value)}
            description="The host can always skip ahead."
          />
        </Section>
      </div>

      <WordSources draft={draft} editable={editable} />
    </div>
  )
}

function Section({
  title,
  children,
}: {
  readonly title: string
  readonly children: ReactNode
}) {
  const id = `settings-${title.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <Card labelledBy={id} className="grid content-start gap-5">
      <h3 id={id} className="text-lg font-black tracking-[-0.02em]">
        {title}
      </h3>
      {children}
    </Card>
  )
}
