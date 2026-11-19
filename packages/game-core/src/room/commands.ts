import type { RoomContext } from './context'
import { reject } from './context'
import { handleDraftReplace, handleDraftSelect } from './draft'
import { handleDrawingOps, handleHintVote } from './drawing'
import { handleGuess } from './guess'
import {
  handleAddBot,
  handleJoin,
  handleLeave,
  handleLinkAccount,
  handleMatchStart,
  handlePresence,
  handleRemoveMember,
  handleRename,
  handleSetReady,
  handleSetTeam,
  handleShuffleTeams,
  handleUpdateSettings,
} from './lobby'
import { handleRematch } from './match'
import { handleRoundContinue, handleSurrenderVote } from './results'
import type { RoomCommand } from './types'

/** Routes one command to its rule module. Rejections throw RoomRejection. */
export function dispatchCommand(ctx: RoomContext, command: RoomCommand): void {
  switch (command.type) {
    case 'member.join':
      return handleJoin(ctx, command)
    case 'member.presence':
      return handlePresence(ctx, command)
    case 'member.leave':
      return handleLeave(ctx, command)
    case 'member.link-account':
      return handleLinkAccount(ctx, command)
    case 'member.rename':
      return handleRename(ctx, command)
    case 'lobby.set-team':
      return handleSetTeam(ctx, command)
    case 'lobby.shuffle-teams':
      return handleShuffleTeams(ctx, command)
    case 'lobby.set-ready':
      return handleSetReady(ctx, command)
    case 'lobby.update-settings':
      return handleUpdateSettings(ctx, command)
    case 'lobby.add-bot':
      return handleAddBot(ctx, command)
    case 'lobby.remove-member':
      return handleRemoveMember(ctx, command)
    case 'match.start':
      return handleMatchStart(ctx, command)
    case 'draft.select':
      return handleDraftSelect(ctx, command)
    case 'draft.replace':
      return handleDraftReplace(ctx, command)
    case 'drawing.ops':
      return handleDrawingOps(ctx, command)
    case 'guess.submit':
      return handleGuess(ctx, command)
    case 'hint.vote':
      return handleHintVote(ctx, command)
    case 'surrender.vote':
      return handleSurrenderVote(ctx, command)
    case 'round.continue':
      return handleRoundContinue(ctx, command)
    case 'match.rematch':
      return handleRematch(ctx, command)
    default:
      return rejectUnknown(command)
  }
}

/** Runtime guard for commands that bypassed the wire schema. */
function rejectUnknown(_command: never): never {
  return reject('BAD_COMMAND', 'Unknown command.')
}
