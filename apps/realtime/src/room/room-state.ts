import { applyRoomCommand, type RoomCommand, type RoomEffect, type RoomMember, type RoomState } from '@drawing-games/game-core';

/** Small read helpers over RoomState for the realtime layer. */

export function findActiveHuman(state: RoomState, memberId: string): RoomMember | undefined {
	return state.members.find((member) => member.id === memberId && member.kind === 'human' && member.left !== true);
}

export function activeMemberCount(state: RoomState): number {
	return state.members.filter((member) => member.left !== true).length;
}

/** Humans present in `prev` who left or were removed by `next`. */
export function removedHumanIds(prev: RoomState, next: RoomState): string[] {
	if (prev.members === next.members) return [];
	return prev.members
		.filter((member) => member.kind === 'human' && member.left !== true && findActiveHuman(next, member.id) === undefined)
		.map((member) => member.id);
}

/**
 * Applies server-originated commands in order at one instant. A rejection
 * keeps the (possibly advanced) state and moves on: these commands describe
 * facts such as presence, not player requests that need an answer.
 */
export function applyServerCommands(
	state: RoomState,
	commands: readonly RoomCommand[],
	nowMs: number,
): { readonly state: RoomState; readonly effects: readonly RoomEffect[] } {
	let current = state;
	const effects: RoomEffect[] = [];
	for (const command of commands) {
		const result = applyRoomCommand(current, command, nowMs);
		current = result.state;
		effects.push(...result.effects);
	}
	return { state: current, effects };
}
