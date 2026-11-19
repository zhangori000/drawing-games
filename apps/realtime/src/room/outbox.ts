import type { DrawingAction, DrawingDocument, DrawingState } from '@drawing-games/drawing-model';
import {
	computeCanvasPreview,
	getCanvasAccess,
	projectRoomView,
	type CanvasPreview,
	type RoomState,
	type TeamId,
} from '@drawing-games/game-core';
import { MAX_POINTS_PER_APPEND, ROOM_DOMAIN_EVENT_NAMES } from '@drawing-games/protocol';

import type { CanvasStore, LiveCanvas } from './canvas-store';
import { MAX_OPS_PER_EVENT } from './constants';
import { domainEvent, encodeEnvelope, type OutgoingEvent } from './envelopes';
import { safeSend, type BoundSocket, type SocketRegistry } from './sockets';

/** Accepted drawing ops from one effect, ready to fan out. */
export interface CanvasBatch {
	readonly canvasId: string;
	readonly team: TeamId;
	readonly ops: readonly DrawingAction[];
	/** The member who drew them (their socket already has them); null for bots. */
	readonly authorId: string | null;
}

export interface CanvasChanges {
	readonly resetIds: ReadonlySet<string>;
	readonly batches: readonly CanvasBatch[];
	/** Canvases whose document changed through drawing ops (previews are due). */
	readonly drawnIds: ReadonlySet<string>;
	/** canvasId → member whose ops hit the canvas cap; they get an authoritative snapshot. */
	readonly overLimit: ReadonlyMap<string, string>;
}

export const NO_CANVAS_CHANGES: CanvasChanges = Object.freeze({
	resetIds: new Set<string>(),
	batches: [],
	drawnIds: new Set<string>(),
	overLimit: new Map<string, string>(),
});

/**
 * Everything the room sends after a change: per-viewer views (skipped when
 * unchanged), canvas ops for sockets that already hold the canvas, and
 * snapshots or previews for canvases a socket may newly see.
 */
export class RoomOutbox {
	private readonly previews = new WeakMap<DrawingDocument, CanvasPreview>();

	constructor(
		private readonly registry: SocketRegistry,
		private readonly canvases: CanvasStore,
	) {}

	send(ws: WebSocket, state: RoomState, event: OutgoingEvent): void {
		safeSend(ws, encodeEnvelope(state.roomCode, state.seq, event));
	}

	toMember(state: RoomState, memberId: string, event: OutgoingEvent): void {
		for (const ws of this.registry.socketsOf(memberId)) this.send(ws, state, event);
	}

	/** Each bound socket gets its own projection, unless only `seq` changed. */
	views(state: RoomState, nowMs: number): void {
		for (const { ws, memberId, entry } of this.registry.bound()) {
			const view = projectRoomView(state, memberId, nowMs);
			// seq moves on every accepted change (each drawing batch); a view
			// that differs only in seq carries nothing new for the browser.
			const comparable = JSON.stringify({ ...view, seq: 0 });
			if (comparable === entry.lastView) continue;
			entry.lastView = comparable;
			this.send(ws, state, { type: 'room.snapshot', state: view });
		}
	}

	canvasesFor(state: RoomState, changes: CanvasChanges): void {
		for (const socket of this.registry.bound()) this.deliverCanvases(state, changes, socket);
	}

	/** Sends the latest preview of a canvas to every socket limited to previews of it. */
	previewToWatchers(state: RoomState, canvasId: string): void {
		const canvas = this.canvases.get(canvasId);
		if (canvas === null) return;
		const event = this.previewEvent(canvas);
		for (const { ws, memberId } of this.registry.bound()) {
			if (getCanvasAccess(state, memberId).preview.includes(canvasId)) this.send(ws, state, event);
		}
	}

	private deliverCanvases(state: RoomState, changes: CanvasChanges, { ws, memberId, entry }: BoundSocket): void {
		const access = getCanvasAccess(state, memberId);
		const full = new Set(access.full);
		for (const canvasId of changes.resetIds) {
			entry.full.delete(canvasId);
			entry.preview.delete(canvasId);
		}
		for (const batch of changes.batches) {
			if (!full.has(batch.canvasId) || !entry.full.has(batch.canvasId) || batch.authorId === memberId) continue;
			this.sendOps(ws, state, batch.canvasId, batch.team, batch.ops);
		}
		for (const [canvasId, authorId] of changes.overLimit) {
			if (authorId === memberId) entry.full.delete(canvasId);
		}
		for (const canvasId of access.full) {
			if (!entry.full.has(canvasId)) this.sendSnapshot(ws, state, canvasId);
		}
		for (const canvasId of access.preview) {
			if (entry.preview.has(canvasId)) continue;
			const canvas = this.canvases.get(canvasId);
			if (canvas !== null) this.send(ws, state, this.previewEvent(canvas));
		}
		entry.full = full;
		entry.preview = new Set(access.preview);
	}

	/** Snapshot (completed strokes) plus ops that replay half-drawn strokes. */
	private sendSnapshot(ws: WebSocket, state: RoomState, canvasId: string): void {
		const canvas = this.canvases.get(canvasId);
		if (canvas === null) return;
		this.send(
			ws,
			state,
			domainEvent({
				name: ROOM_DOMAIN_EVENT_NAMES.canvasSnapshot,
				payload: { canvasId, team: canvas.team, document: canvas.drawing.document },
			}),
		);
		const catchUp = inProgressOps(canvas.drawing);
		if (catchUp.length > 0) this.sendOps(ws, state, canvasId, canvas.team, catchUp);
	}

	private sendOps(ws: WebSocket, state: RoomState, canvasId: string, team: TeamId, ops: readonly DrawingAction[]): void {
		for (let start = 0; start < ops.length; start += MAX_OPS_PER_EVENT) {
			this.send(
				ws,
				state,
				domainEvent({
					name: ROOM_DOMAIN_EVENT_NAMES.canvasOps,
					payload: { canvasId, team, ops: ops.slice(start, start + MAX_OPS_PER_EVENT) },
				}),
			);
		}
	}

	private previewEvent(canvas: LiveCanvas): OutgoingEvent {
		const document = canvas.drawing.document;
		let preview = this.previews.get(document);
		if (preview === undefined) {
			preview = computeCanvasPreview(document);
			this.previews.set(document, preview);
		}
		return domainEvent({
			name: ROOM_DOMAIN_EVENT_NAMES.canvasPreview,
			payload: { canvasId: canvas.canvasId, team: canvas.team, cols: preview.cols, rows: preview.rows, cells: preview.cells },
		});
	}
}

export function inProgressOps(drawing: DrawingState): DrawingAction[] {
	const ops: DrawingAction[] = [];
	for (const strokeId of drawing.inProgressOrder) {
		const stroke = drawing.inProgressById[strokeId];
		const [first, ...rest] = stroke?.points ?? [];
		if (stroke === undefined || first === undefined) continue;
		ops.push({ type: 'stroke.begin', strokeId, point: first, style: stroke.style });
		for (let offset = 0; offset < rest.length; offset += MAX_POINTS_PER_APPEND) {
			ops.push({
				type: 'stroke.append',
				strokeId,
				startPointIndex: 1 + offset,
				points: rest.slice(offset, offset + MAX_POINTS_PER_APPEND),
			});
		}
	}
	return ops;
}
