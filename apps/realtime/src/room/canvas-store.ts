import { createDrawingState, drawingReducer, type DrawingAction, type DrawingState } from '@drawing-games/drawing-model';
import type { TeamId } from '@drawing-games/game-core';
import { drawingDocumentSchema } from '@drawing-games/protocol';

import { CANVAS_LIMITS } from './constants';

/**
 * The authoritative canvases of the current match. Memory is a cache over
 * the `canvases` table; only the history-free document is persisted, so
 * undo history and half-drawn strokes do not survive an eviction.
 */
export interface LiveCanvas {
	readonly canvasId: string;
	readonly team: TeamId;
	drawing: DrawingState;
}

export interface CanvasLimits {
	readonly maxStrokes: number;
	readonly maxPoints: number;
}

export interface CanvasOpsResult {
	/** Ops that changed the canvas, in order; only these are fanned out. */
	readonly applied: readonly DrawingAction[];
	/** Some ops were refused because the canvas is full. */
	readonly overLimit: boolean;
	readonly documentChanged: boolean;
}

export class CanvasStore {
	private readonly live = new Map<string, LiveCanvas>();
	private readonly dirty = new Set<string>();
	private clearPending = false;

	constructor(
		private readonly sql: SqlStorage,
		private readonly limits: CanvasLimits = CANVAS_LIMITS,
	) {}

	get(canvasId: string): LiveCanvas | null {
		const cached = this.live.get(canvasId);
		if (cached !== undefined) return cached;
		if (this.clearPending) return null;
		const loaded = this.load(canvasId);
		if (loaded !== null) this.live.set(canvasId, loaded);
		return loaded;
	}

	/** A fresh, empty canvas (new round or showdown card). */
	reset(canvasId: string, team: TeamId): void {
		this.live.set(canvasId, { canvasId, team, drawing: createDrawingState() });
		this.dirty.add(canvasId);
	}

	/**
	 * Applies ops with the drawing-model reducer. Ops the reducer ignores
	 * (duplicates, out of order) are dropped, as are ops that would push the
	 * canvas past its stroke or point cap; an append over the cap abandons
	 * its stroke (as an explicit `stroke.delete`) so it never stays half-drawn.
	 */
	applyOps(canvasId: string, team: TeamId, ops: readonly DrawingAction[]): CanvasOpsResult {
		const canvas = this.get(canvasId) ?? this.create(canvasId, team);
		const before = canvas.drawing.document;
		const applied: DrawingAction[] = [];
		let overLimit = false;
		for (const op of ops) {
			const next = drawingReducer(canvas.drawing, op);
			if (next === canvas.drawing) continue;
			if (this.grewPastLimit(canvas.drawing, next)) {
				overLimit = true;
				if (op.type === 'stroke.append') {
					const abandon: DrawingAction = { type: 'stroke.delete', strokeId: op.strokeId };
					canvas.drawing = drawingReducer(canvas.drawing, abandon);
					applied.push(abandon);
				}
				continue;
			}
			canvas.drawing = next;
			applied.push(op);
		}
		const documentChanged = canvas.drawing.document !== before;
		if (documentChanged) this.dirty.add(canvasId);
		return { applied, overLimit, documentChanged };
	}

	/** Forgets every canvas (a new match started). Applied by the next flush. */
	deleteAll(): void {
		this.live.clear();
		this.dirty.clear();
		this.clearPending = true;
	}

	/** Writes pending changes. Call inside the commit transaction. */
	flush(nowMs: number): void {
		if (this.clearPending) {
			this.sql.exec(`DELETE FROM canvases`);
			this.clearPending = false;
		}
		for (const canvasId of this.dirty) {
			const canvas = this.live.get(canvasId);
			if (canvas === undefined) continue;
			this.sql.exec(
				`INSERT INTO canvases (canvas_id, team, document, updated_at) VALUES (?, ?, ?, ?)
				 ON CONFLICT (canvas_id) DO UPDATE SET team = excluded.team, document = excluded.document, updated_at = excluded.updated_at`,
				canvasId,
				canvas.team,
				JSON.stringify(canvas.drawing.document),
				nowMs,
			);
		}
		this.dirty.clear();
	}

	/** Drops the memory cache; the next read comes from storage. */
	dropCache(): void {
		this.live.clear();
		this.dirty.clear();
		this.clearPending = false;
	}

	private create(canvasId: string, team: TeamId): LiveCanvas {
		this.reset(canvasId, team);
		return this.live.get(canvasId) as LiveCanvas;
	}

	private load(canvasId: string): LiveCanvas | null {
		const row = this.sql
			.exec<{ team: string; document: string }>(`SELECT team, document FROM canvases WHERE canvas_id = ?`, canvasId)
			.toArray()[0];
		if (row === undefined || (row.team !== 'A' && row.team !== 'B')) return null;
		const document = drawingDocumentSchema.safeParse(JSON.parse(row.document));
		if (!document.success) {
			console.error('room: stored canvas is invalid', { canvasId });
			return null;
		}
		return { canvasId, team: row.team, drawing: createDrawingState({ document: document.data }) };
	}

	private grewPastLimit(current: DrawingState, next: DrawingState): boolean {
		const strokes = strokeCount(next);
		if (strokes > this.limits.maxStrokes && strokes > strokeCount(current)) return true;
		const points = pointCount(next);
		return points > this.limits.maxPoints && points > pointCount(current);
	}
}

/** Completed plus in-progress strokes. */
export function strokeCount(drawing: DrawingState): number {
	return drawing.document.strokeOrder.length + drawing.inProgressOrder.length;
}

export function pointCount(drawing: DrawingState): number {
	let total = 0;
	for (const id of drawing.document.strokeOrder) total += drawing.document.strokesById[id]?.points.length ?? 0;
	for (const id of drawing.inProgressOrder) total += drawing.inProgressById[id]?.points.length ?? 0;
	return total;
}
