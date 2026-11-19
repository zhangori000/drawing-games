import type { ProtocolErrorCode } from '@drawing-games/protocol'

/**
 * Why a command did not succeed: a server `protocol.error` code, or a
 * client-side outcome (`TIMEOUT` after 8 s without an ack, `CLOSED` when the
 * connection ended for good before an ack).
 */
export type RoomCommandErrorCode = ProtocolErrorCode | 'TIMEOUT' | 'CLOSED'

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
