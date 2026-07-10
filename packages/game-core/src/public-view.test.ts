import { describe, expect, it } from 'vitest'

import type { OpponentDraftVisibility } from './settings'
import {
  projectPublicRoomView,
  type AuthoritativeRoomViewSource,
} from './public-view'

describe('projectPublicRoomView chosen-word privacy', () => {
  it('shows each final word only to its owning active drawer', () => {
    const state = roomState('drawing', 'options-and-actions')

    for (const player of state.players) {
      const view = projectPublicRoomView(state, {
        kind: 'player',
        playerId: player.id,
      })

      for (const team of ['A', 'B'] as const) {
        const chosen = view.round?.drafts[team].chosenWord
        const isOwningDrawer =
          player.team === team && state.round?.drawers[team] === player.id

        expect(chosen?.visibility).toBe(
          isOwningDrawer ? 'drawer-only' : 'hidden',
        )

        if (isOwningDrawer) {
          expect(chosen).toHaveProperty(
            'word',
            team === 'A' ? 'volcano' : 'telescope',
          )
        } else {
          expect(chosen).not.toHaveProperty('word')
          expect(chosen).not.toHaveProperty('optionId')
          expect(chosen).not.toHaveProperty('difficulty')
        }
      }
    }
  })

  it('never exposes chosen words to spectators or unknown player identities', () => {
    const state = roomState('round-results', 'options-and-actions')

    for (const audience of [
      { kind: 'spectator' as const },
      { kind: 'player' as const, playerId: 'not-in-this-room' },
    ]) {
      const view = projectPublicRoomView(state, audience)

      expect(view.viewer).toEqual({
        audience: 'spectator',
        role: 'spectator',
      })
      expect(view.round?.drafts.A.chosenWord).toEqual({
        visibility: 'hidden',
      })
      expect(view.round?.drafts.B.chosenWord).toEqual({
        visibility: 'hidden',
      })
      expect(JSON.stringify(view)).not.toContain('volcano')
      expect(JSON.stringify(view)).not.toContain('telescope')
    }
  })

  it('keeps a same-team guesser blind even when opponent draft transparency is enabled', () => {
    const state = roomState('word-draft', 'options-and-actions')
    const teamAGuesser = projectPublicRoomView(state, {
      kind: 'player',
      playerId: 'a2',
    })

    expect(teamAGuesser.round?.drafts.A.options).toBeNull()
    expect(teamAGuesser.round?.drafts.A.seenActionCount).toBeNull()
    expect(teamAGuesser.round?.drafts.A.chosenWord).toEqual({
      visibility: 'hidden',
    })

    // As an opponent, the same viewer may see Team B's candidate pool during
    // the draft, but still not which candidate Team B locked.
    expect(teamAGuesser.round?.drafts.B.options).toHaveLength(2)
    expect(teamAGuesser.round?.drafts.B.chosenWord).toEqual({
      visibility: 'hidden',
    })
  })

  it('fails closed when authoritative chosen state is malformed', () => {
    const state = roomState('drawing', 'hidden')
    const malformed: AuthoritativeRoomViewSource = {
      ...state,
      round: {
        ...(state.round as NonNullable<typeof state.round>),
        drafts: {
          ...(state.round as NonNullable<typeof state.round>).drafts,
          A: {
            ...(state.round as NonNullable<typeof state.round>).drafts.A,
            chosenOptionId: 'missing-option',
          },
        },
      },
    }

    expect(
      projectPublicRoomView(malformed, {
        kind: 'player',
        playerId: 'a1',
      }).round?.drafts.A.chosenWord,
    ).toEqual({ visibility: 'hidden' })
  })
})

describe('projectPublicRoomView draft audiences', () => {
  it.each([
    {
      setting: 'options-and-actions' as const,
      optionsVisible: true,
      actionCount: 1,
    },
    {
      setting: 'actions-only' as const,
      optionsVisible: false,
      actionCount: 1,
    },
    {
      setting: 'hidden' as const,
      optionsVisible: false,
      actionCount: null,
    },
  ])(
    'applies $setting to an opposing player',
    ({ setting, optionsVisible, actionCount }) => {
      const view = projectPublicRoomView(roomState('word-draft', setting), {
        kind: 'player',
        playerId: 'b2',
      })
      const observedDraft = view.round?.drafts.A

      expect(observedDraft?.options === null).toBe(!optionsVisible)
      expect(observedDraft?.seenActionCount).toBe(actionCount)
      expect(observedDraft?.chosenWord).toEqual({ visibility: 'hidden' })
    },
  )

  it('stops projecting opponent candidate pools after the draft phase', () => {
    const view = projectPublicRoomView(
      roomState('drawing', 'options-and-actions'),
      { kind: 'player', playerId: 'b2' },
    )

    expect(view.round?.drafts.A.options).toBeNull()
    expect(view.round?.drafts.A.seenActionCount).toBeNull()
  })

  it('returns fresh objects instead of server-state references', () => {
    const state = roomState('word-draft', 'options-and-actions')
    const view = projectPublicRoomView(state, {
      kind: 'player',
      playerId: 'a1',
    })

    expect(view.scores).not.toBe(state.scores)
    expect(view.players).not.toBe(state.players)
    expect(view.round?.drafts.A.options).not.toBe(state.round?.drafts.A.options)
  })
})

function roomState(
  phase: AuthoritativeRoomViewSource['phase'],
  opponentDraftVisibility: OpponentDraftVisibility,
): AuthoritativeRoomViewSource {
  return {
    roomCode: 'VIEW1',
    roomSeq: 12,
    phase,
    scores: { A: 125, B: 90 },
    opponentDraftVisibility,
    players: [
      { id: 'a1', displayName: 'A Drawer', team: 'A' },
      { id: 'a2', displayName: 'A Guesser', team: 'A' },
      { id: 'b1', displayName: 'B Drawer', team: 'B' },
      { id: 'b2', displayName: 'B Guesser', team: 'B' },
    ],
    round: {
      number: 1,
      drawers: { A: 'a1', B: 'b1' },
      drafts: {
        A: {
          options: [
            { id: 'a-volcano', word: 'volcano', difficulty: 'medium' },
            { id: 'a-cat', word: 'cat', difficulty: 'easy' },
          ],
          seenOptionIds: ['a-old'],
          chosenOptionId: 'a-volcano',
        },
        B: {
          options: [
            { id: 'b-telescope', word: 'telescope', difficulty: 'medium' },
            { id: 'b-sun', word: 'sun', difficulty: 'easy' },
          ],
          seenOptionIds: [],
          chosenOptionId: 'b-telescope',
        },
      },
      solved: { A: false, B: false },
      draftDeadlineAtMs: 15_000,
      drawingDeadlineAtMs: phase === 'word-draft' ? null : 105_000,
    },
  }
}
