import type { RoomCommand } from '@drawing-games/game-core';
import type { ClientCommand } from '@drawing-games/protocol';

/** Every client command except the handshake, which binds a socket instead. */
export type MemberCommand = Exclude<ClientCommand, { readonly type: 'room.join' | 'room.resume' }>;

export type MappedCommand =
	| { readonly kind: 'room'; readonly command: RoomCommand }
	/** Accepted and acknowledged without touching room state. */
	| { readonly kind: 'ack-only' }
	/** Needs the account token verified before it becomes `member.link-account`. */
	| { readonly kind: 'link-account'; readonly accountToken: string | null };

/** Translates a wire command from an authenticated member into a reducer command. */
export function mapMemberCommand(command: MemberCommand, memberId: string): MappedCommand {
	const actorId = memberId;
	switch (command.type) {
		case 'room.leave':
			return room({ type: 'member.leave', memberId });
		case 'account.link':
			return { kind: 'link-account', accountToken: command.accountToken };
		case 'member.rename':
			return room({ type: 'member.rename', memberId, displayName: command.displayName });
		case 'lobby.team':
			return room({ type: 'lobby.set-team', actorId, memberId: command.memberId ?? memberId, team: command.team });
		case 'lobby.shuffle':
			return room({ type: 'lobby.shuffle-teams', actorId });
		case 'lobby.ready':
			return room({ type: 'lobby.set-ready', actorId, ready: command.ready });
		case 'lobby.settings':
			return room({ type: 'lobby.update-settings', actorId, patch: command.patch });
		case 'lobby.bot.add':
			return room({ type: 'lobby.add-bot', actorId, team: command.team });
		case 'lobby.member.remove':
			return room({ type: 'lobby.remove-member', actorId, memberId: command.memberId });
		case 'match.start':
			return room({ type: 'match.start', actorId });
		case 'round.continue':
			return room({ type: 'round.continue', actorId });
		case 'draft.select':
			return room({ type: 'draft.select', actorId, wordId: command.optionId });
		case 'draft.seen':
			return room({ type: 'draft.replace', actorId, wordId: command.optionId, reason: 'seen-before' });
		case 'draft.replace':
			return room({ type: 'draft.replace', actorId, wordId: command.optionId, reason: command.reason });
		case 'guess.submit':
			return room({ type: 'guess.submit', actorId, text: command.text });
		case 'hint.vote':
			return room({ type: 'hint.vote', actorId, approve: command.approve });
		case 'drawing.batch':
			return room({
				type: 'drawing.ops',
				actorId,
				ops: command.operations,
				...(command.canvasId === undefined ? {} : { canvasId: command.canvasId }),
			});
		case 'surrender.vote':
			return room({ type: 'surrender.vote', actorId, approve: command.approve });
		case 'rematch.vote':
			return command.mode === 'decline' ? { kind: 'ack-only' } : room({ type: 'match.rematch', actorId, mode: command.mode });
	}
}

function room(command: RoomCommand): MappedCommand {
	return { kind: 'room', command };
}
