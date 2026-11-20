import { canvasAccessFor } from './access'
import { nextWakeAtMs, runDueWork } from './advance'
import { dispatchCommand } from './commands'
import { createContext, finishContext, RoomRejection } from './context'
import { projectView } from './projection'
import { normalizeSeed } from './rng'
import { DEFAULT_ROOM_SETTINGS } from './settings'
import type {
  CanvasAccess,
  RoomAdvanceResult,
  RoomCommand,
  RoomCommandResult,
  RoomState,
  RoomView,
} from './types'
import { ROOM_STATE_VERSION } from './types'

export { assertRoomInvariants, RoomInvariantError } from './invariants'

/**
 * Reducer entry points. Signatures are fixed: the realtime room and the web
 * client compile against them. Rules live in the sibling modules.
 */

export interface CreateRoomInput {
  readonly roomCode: string
  readonly nowMs: number
  /** Any safe integer; normalized to uint32 PRNG state. */
  readonly seed: number
}

/** A brand-new empty room in the lobby with default settings and no host. */
export function createRoomState(input: CreateRoomInput): RoomState {
  return {
    version: ROOM_STATE_VERSION,
    roomCode: input.roomCode,
    createdAtMs: input.nowMs,
    seq: 0,
    rngState: normalizeSeed(input.seed),
    phase: 'lobby',
    phaseStartedAtMs: input.nowMs,
    phaseDeadlineAtMs: null,
    hostId: null,
    settings: DEFAULT_ROOM_SETTINGS,
    members: [],
    nextBotNumber: 1,
    match: null,
    wordMemory: {
      usedWordIds: [],
      offeredAt: {},
      recentPackIds: [],
      draftCounter: 0,
    },
    bots: { schedule: [], strokesDrawn: {} },
    lastActivityAtMs: input.nowMs,
    changedAtMs: input.nowMs,
  }
}

/**
 * Applies one authenticated command at server time `nowMs`. Advances any
 * expired deadlines/bot actions first (see advanceRoom). Pure and
 * deterministic: same state + command + nowMs => same result.
 */
export function applyRoomCommand(
  state: RoomState,
  command: RoomCommand,
  nowMs: number,
): RoomCommandResult {
  const advanced = advanceRoom(state, nowMs)
  const ctx = createContext(advanced.state, nowMs)
  try {
    dispatchCommand(ctx, command)
  } catch (error) {
    if (!(error instanceof RoomRejection)) throw error
    return {
      ok: false,
      state: advanced.state,
      effects: advanced.effects,
      error: { code: error.code, message: error.message },
    }
  }

  let next = finishContext(ctx)
  if (next === advanced.state) {
    return { ok: true, state: next, effects: advanced.effects }
  }
  next = {
    ...next,
    seq: next.seq + 1,
    lastActivityAtMs: nowMs,
    changedAtMs: nowMs,
  }
  // A command can make work due immediately (e.g. a human reconnecting lets
  // a long-gone host hand over); settle it at the same instant.
  const settle = createContext(next, nowMs)
  runDueWork(settle, nowMs, nowMs)
  return {
    ok: true,
    state: finishContext(settle),
    effects: [...advanced.effects, ...ctx.effects, ...settle.effects],
  }
}

/** Applies every deadline transition and bot action due at or before nowMs. */
export function advanceRoom(
  state: RoomState,
  nowMs: number,
): RoomAdvanceResult {
  const ctx = createContext(state, nowMs)
  runDueWork(ctx, nowMs)
  return { state: finishContext(ctx), effects: ctx.effects }
}

/** Earliest absolute time advanceRoom has work to do, or null if none. */
export function getNextWakeAtMs(state: RoomState): number | null {
  return nextWakeAtMs(state)
}

/** Audience-safe projection for one viewer (null => non-member). */
export function projectRoomView(
  state: RoomState,
  viewerId: string | null,
  nowMs: number,
): RoomView {
  return projectView(state, viewerId, nowMs)
}

/** Which canvases this viewer may receive raw strokes for vs. a preview. */
export function getCanvasAccess(
  state: RoomState,
  viewerId: string | null,
): CanvasAccess {
  return canvasAccessFor(state, viewerId)
}
