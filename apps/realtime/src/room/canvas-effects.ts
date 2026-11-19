import type { RoomEffect, RoomState } from '@drawing-games/game-core';

import type { CanvasStore } from './canvas-store';
import type { CanvasBatch, CanvasChanges } from './outbox';

export interface AppliedCanvasEffects {
	readonly changes: CanvasChanges;
	/** A new match began, so every earlier canvas was discarded. */
	readonly startedMatch: boolean;
}

/**
 * Applies the reducer's canvas effects to the canvas store (in memory; the
 * caller persists them in its commit transaction) and describes what must
 * be delivered. Only the current match's canvases are kept.
 */
export function applyCanvasEffects(
	canvases: CanvasStore,
	prev: RoomState,
	next: RoomState,
	effects: readonly RoomEffect[],
): AppliedCanvasEffects {
	const startedMatch = next.match !== null && next.match.number !== prev.match?.number;
	if (startedMatch) canvases.deleteAll();

	const resetIds = new Set<string>();
	const drawnIds = new Set<string>();
	const batches: CanvasBatch[] = [];
	const overLimit = new Map<string, string>();
	for (const effect of effects) {
		if (effect.type === 'canvas.reset') {
			canvases.reset(effect.canvasId, effect.team);
			resetIds.add(effect.canvasId);
			drawnIds.delete(effect.canvasId);
		} else if (effect.type === 'canvas.ops') {
			const result = canvases.applyOps(effect.canvasId, effect.team, effect.ops);
			const authorId = effect.origin === 'member' ? effect.actorId : null;
			if (result.applied.length > 0) {
				batches.push({ canvasId: effect.canvasId, team: effect.team, ops: result.applied, authorId });
			}
			if (result.documentChanged) drawnIds.add(effect.canvasId);
			if (result.overLimit && authorId !== null) overLimit.set(effect.canvasId, authorId);
		}
	}
	return { changes: { resetIds, batches, drawnIds, overLimit }, startedMatch };
}
