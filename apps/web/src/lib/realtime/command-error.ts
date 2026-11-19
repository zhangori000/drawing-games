import type { ProtocolErrorCode } from '@drawing-games/protocol'

/**
 * Why a command did not succeed: a server `protocol.error` code, or a
 * client-side outcome (`TIMEOUT` after 8 s without an ack, `CLOSED` when the
 * connection ended for good before an ack, `TOO_LARGE` when the encoded
 * command is over the room's message cap and was never sent (or the room
 * closed the socket for it with 1009), `STALE` when its `isCurrent` check
 * failed before it could be sent).
 */
export type RoomCommandErrorCode =
  ProtocolErrorCode | 'TIMEOUT' | 'CLOSED' | 'TOO_LARGE' | 'STALE'

export class RoomCommandError extends Error {
  readonly code: RoomCommandErrorCode
  readonly retryable: boolean
  readonly commandId: string | null

  constructor(
    code: RoomCommandErrorCode,
    message: string,
    options: { retryable?: boolean; commandId?: string | null } = {},
  ) {
    super(message)
    this.name = 'RoomCommandError'
    this.code = code
    this.retryable = options.retryable ?? false
    this.commandId = options.commandId ?? null
  }
}

export function isRoomCommandError(error: unknown): error is RoomCommandError {
  return error instanceof RoomCommandError
}
