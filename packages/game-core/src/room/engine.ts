import type {
  CanvasAccess,
  RoomAdvanceResult,
  RoomCommand,
  RoomCommandResult,
  RoomState,
  RoomView,
} from './types'

/**
 * CONTRACT STUBS — replaced by the real reducer. Signatures are fixed:
 * the realtime room and the web client compile against them.
 */

export interface CreateRoomInput {
  readonly roomCode: string
  readonly nowMs: number
  /** Any safe integer; normalized to uint32 PRNG state. */
  readonly seed: number
}

/** A brand-new empty room in the lobby with default settings and no host. */
export function createRoomState(_input: CreateRoomInput): RoomState {
  throw new Error('createRoomState is not implemented yet')
}

/**
 * Applies one authenticated command at server time `nowMs`. Advances any
 * expired deadlines/bot actions first (see advanceRoom). Pure and
 * deterministic: same state + command + nowMs => same result.
 */
export function applyRoomCommand(
  _state: RoomState,
  _command: RoomCommand,
  _nowMs: number,
): RoomCommandResult {
  throw new Error('applyRoomCommand is not implemented yet')
}

/** Applies every deadline transition and bot action due at or before nowMs. */
export function advanceRoom(
  _state: RoomState,
  _nowMs: number,
): RoomAdvanceResult {
  throw new Error('advanceRoom is not implemented yet')
}

/** Earliest absolute time advanceRoom has work to do, or null if none. */
export function getNextWakeAtMs(_state: RoomState): number | null {
  throw new Error('getNextWakeAtMs is not implemented yet')
}

/** Audience-safe projection for one viewer (null => non-member). */
export function projectRoomView(
  _state: RoomState,
  _viewerId: string | null,
  _nowMs: number,
): RoomView {
  throw new Error('projectRoomView is not implemented yet')
}

/** Which canvases this viewer may receive raw strokes for vs. a preview. */
export function getCanvasAccess(
  _state: RoomState,
  _viewerId: string | null,
): CanvasAccess {
  throw new Error('getCanvasAccess is not implemented yet')
}
