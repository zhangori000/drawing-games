import { difficultySlots, type PlayableWord } from '@drawing-games/word-bank'

import type { TeamId } from '../types'
import { planBotDraftPick } from './bots'
import type { RoomContext } from './context'
import { emit, patchState, requireMatch, updateMatch } from './context'
import { nextRotationDrawer, teamRoster } from './members'
import type {
  DraftOption,
  RoomMember,
  RoundState,
  TeamRoundState,
} from './types'
import {
  freshShareFor,
  recordOffers,
  roomPool,
  selectDraftWords,
  toDraftOption,
} from './words'

function roundCanvasId(
  matchNumber: number,
  roundNumber: number,
  team: TeamId,
): string {
  return `m${matchNumber}-r${roundNumber}-${team}`
}

/** Draws one team's draft cards and records them as offered. */
function draftCards(
  ctx: RoomContext,
  pool: readonly PlayableWord[],
  drawer: RoomMember,
  opponentCards: readonly DraftOption[],
  maxFreshCards: number | undefined,
): DraftOption[] {
  const settings = ctx.state.settings
  const random = () => ctx.rng.next()
  const slots = difficultySlots(
    settings.difficultyMix,
    settings.wordChoiceCount,
    random,
  )
  const words = selectDraftWords(
    {
      pool,
      slots,
      drawer,
      teammates: teamRoster(ctx.state, drawer.team).filter(
        (member) => member.id !== drawer.id,
      ),
      ownCards: [],
      opponentCards,
      replacedWordIds: [],
      wordMemory: ctx.state.wordMemory,
      ...(maxFreshCards === undefined ? {} : { maxFreshCards }),
    },
    random,
  )
  recordOffers(
    ctx,
    words.map((word) => word.id),
  )
  return words.map(toDraftOption)
}

function teamRound(
  team: TeamId,
  drawer: RoomMember,
  options: DraftOption[],
  canvasId: string,
): TeamRoundState {
  return {
    team,
    drawerId: drawer.id,
    options,
    replacements: [],
    chosenWordId: null,
    chosenBy: null,
    canvasId,
    strokeCount: 0,
    firstStrokeAtMs: null,
    guesses: [],
    solution: null,
    hint: { revealed: false, revealedAtMs: null, votes: {} },
  }
}

/**
 * Opens the next normal round: picks both drawers from the rotation, deals
 * team A's cards then team B's (excluding A's), resets both canvases, and
 * starts the word-draft deadline. When the room has too few never-drawn
 * words for two full hands, A takes only its share (`freshShareFor`), so B
 * is never left with drawn words while fresh ones went to A.
 */
export function startRound(ctx: RoomContext): void {
  const match = requireMatch(ctx.state)
  const number = match.completedRounds + 1
  const settings = ctx.state.settings
  const pool = roomPool(settings)

  // Each team's rotation continues after whoever drew its last round
  // (after any mid-turn takeover), so nobody draws twice in a row.
  const previous = match.history[match.history.length - 1]
  const drawerA = nextRotationDrawer(
    ctx.state,
    'A',
    previous?.teams.A.drawerId ?? null,
    ctx.now,
  )
  const drawerB = nextRotationDrawer(
    ctx.state,
    'B',
    previous?.teams.B.drawerId ?? null,
    ctx.now,
  )
  const shareA = freshShareFor(
    pool,
    ctx.state.wordMemory.usedWordIds,
    settings.wordChoiceCount,
    number,
  )
  const optionsA = draftCards(ctx, pool, drawerA, [], shareA)
  const optionsB = draftCards(ctx, pool, drawerB, optionsA, undefined)

  const draftDeadlineAtMs = ctx.now + settings.wordDraftSeconds * 1000
  const round: RoundState = {
    number,
    startedAtMs: ctx.now,
    draftDeadlineAtMs,
    drawingStartedAtMs: null,
    drawingDeadlineAtMs: null,
    endedAtMs: null,
    teams: {
      A: teamRound(
        'A',
        drawerA,
        optionsA,
        roundCanvasId(match.number, number, 'A'),
      ),
      B: teamRound(
        'B',
        drawerB,
        optionsB,
        roundCanvasId(match.number, number, 'B'),
      ),
    },
    scoresBeforeRound: match.scores,
    streakBeforeRound: match.winStreak,
    winner: null,
    shutdownBonus: 0,
  }

  updateMatch(ctx, (current) => ({ ...current, round, surrender: null }))
  patchState(ctx, {
    phase: 'word-draft',
    phaseStartedAtMs: ctx.now,
    phaseDeadlineAtMs: draftDeadlineAtMs,
  })
  for (const team of ['A', 'B'] as const) {
    emit(ctx, {
      type: 'canvas.reset',
      canvasId: round.teams[team].canvasId,
      team,
    })
  }
  planBotDraftPick(ctx, drawerA.id)
  planBotDraftPick(ctx, drawerB.id)
}
