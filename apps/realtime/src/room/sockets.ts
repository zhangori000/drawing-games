import { sessionIdSchema } from '@drawing-games/protocol';

/**
 * Bookkeeping for the room's hibernatable WebSockets. The durable part is
 * the attachment ({sessionId, memberId}); the delivery cache (last view and
 * canvas access sent) lives in memory only and starts empty after the room
 * wakes from hibernation, which just causes a harmless resend.
 */
export interface SocketAttachment {
	readonly sessionId: string;
	/** null until a join/resume binds the socket to a member. */
	readonly memberId: string | null;
	/** While unbound: when the socket connected or was unbound (handshake deadline). */
	readonly unboundSinceMs?: number;
}

export interface SocketEntry {
	readonly sessionId: string;
	memberId: string | null;
	/** When the socket connected or was last unbound; meaningful while unbound. */
	unboundSinceMs: number;
	/** Last projected view sent (JSON without `seq`), to skip unchanged views. */
	lastView: string | null;
	/** Canvases this socket currently holds in full / as previews. */
	full: Set<string>;
	preview: Set<string>;
}

export interface BoundSocket {
	readonly ws: WebSocket;
	readonly memberId: string;
	readonly entry: SocketEntry;
}

const READY_STATE_OPEN = 1;

export class SocketRegistry {
	private readonly entries = new WeakMap<WebSocket, SocketEntry>();

	constructor(private readonly ctx: DurableObjectState) {}

	accept(ws: WebSocket, sessionId: string, nowMs: number): void {
		this.ctx.acceptWebSocket(ws);
		this.persist(ws, { sessionId, memberId: null, unboundSinceMs: nowMs });
		this.entries.set(ws, freshEntry(sessionId, null, nowMs));
	}

	/** Entry for an accepted socket, rebuilt from its attachment after hibernation. */
	entry(ws: WebSocket): SocketEntry | null {
		const cached = this.entries.get(ws);
		if (cached !== undefined) return cached;
		const attachment = readAttachment(ws);
		if (attachment === null) return null;
		// An attachment from before deadlines were stored starts a fresh window.
		const entry = freshEntry(attachment.sessionId, attachment.memberId, attachment.unboundSinceMs ?? Date.now());
		this.entries.set(ws, entry);
		return entry;
	}

	bind(ws: WebSocket, memberId: string): void {
		const entry = this.entry(ws);
		if (entry === null) return;
		this.persist(ws, { sessionId: entry.sessionId, memberId });
		this.entries.set(ws, freshEntry(entry.sessionId, memberId, entry.unboundSinceMs));
	}

	/** Detaches a socket from its member; its handshake deadline starts again. */
	unbind(ws: WebSocket, nowMs = Date.now()): void {
		const entry = this.entry(ws);
		if (entry === null || entry.memberId === null) return;
		entry.memberId = null;
		entry.unboundSinceMs = nowMs;
		this.persist(ws, { sessionId: entry.sessionId, memberId: null, unboundSinceMs: nowMs });
	}

	/** Open sockets bound to a member. */
	bound(): BoundSocket[] {
		const result: BoundSocket[] = [];
		for (const ws of this.ctx.getWebSockets()) {
			if (ws.readyState !== READY_STATE_OPEN) continue;
			const entry = this.entry(ws);
			const memberId = entry?.memberId ?? null;
			if (entry === null || memberId === null) continue;
			result.push({ ws, memberId, entry });
		}
		return result;
	}

	socketsOf(memberId: string): WebSocket[] {
		return this.bound()
			.filter((socket) => socket.memberId === memberId)
			.map((socket) => socket.ws);
	}

	/** Open and not yet bound: the only state in which a handshake may complete. */
	canHandshake(ws: WebSocket): boolean {
		return ws.readyState === READY_STATE_OPEN && this.entry(ws)?.memberId === null;
	}

	/** Members with at least one open, bound socket. */
	memberIds(): Set<string> {
		return new Set(this.bound().map((socket) => socket.memberId));
	}

	/** Whether any member is connected. Unbound sockets never keep a room alive. */
	hasBoundSockets(): boolean {
		return this.bound().length > 0;
	}

	/** Open sockets of this room that are not bound to a member. */
	unbound(): { readonly ws: WebSocket; readonly unboundSinceMs: number }[] {
		const result: { ws: WebSocket; unboundSinceMs: number }[] = [];
		for (const ws of this.ctx.getWebSockets()) {
			if (ws.readyState !== READY_STATE_OPEN) continue;
			const entry = this.entry(ws);
			if (entry === null || entry.memberId !== null) continue;
			result.push({ ws, unboundSinceMs: entry.unboundSinceMs });
		}
		return result;
	}

	/** Every open socket, including ones without an attachment (refused upgrades). */
	open(): WebSocket[] {
		return this.ctx.getWebSockets().filter((ws) => ws.readyState === READY_STATE_OPEN);
	}

	/** Forget what every socket was sent, so the next delivery resends it all. */
	forgetDeliveries(): void {
		for (const ws of this.ctx.getWebSockets()) {
			const entry = this.entry(ws);
			if (entry === null) continue;
			entry.lastView = null;
			entry.full = new Set();
			entry.preview = new Set();
		}
	}

	private persist(ws: WebSocket, attachment: SocketAttachment): void {
		try {
			ws.serializeAttachment(attachment);
		} catch {
			// A socket that is already closing cannot store attachments; its
			// in-memory entry is still updated by the caller.
		}
	}
}

function freshEntry(sessionId: string, memberId: string | null, unboundSinceMs: number): SocketEntry {
	return { sessionId, memberId, unboundSinceMs, lastView: null, full: new Set(), preview: new Set() };
}

function readAttachment(ws: WebSocket): SocketAttachment | null {
	const value: unknown = ws.deserializeAttachment();
	if (typeof value !== 'object' || value === null || !('sessionId' in value) || !('memberId' in value)) return null;
	const sessionId = sessionIdSchema.safeParse(value.sessionId);
	const memberId = value.memberId;
	if (!sessionId.success || (memberId !== null && typeof memberId !== 'string')) return null;
	const since = 'unboundSinceMs' in value ? value.unboundSinceMs : undefined;
	return typeof since === 'number' && Number.isFinite(since)
		? { sessionId: sessionId.data, memberId, unboundSinceMs: since }
		: { sessionId: sessionId.data, memberId };
}

export function safeSend(ws: WebSocket, data: string): void {
	try {
		ws.send(data);
	} catch {
		// The peer is gone; its close event cleans up.
	}
}

export function safeClose(ws: WebSocket, code: number, reason: string): void {
	try {
		ws.close(code, reason);
	} catch {
		// Already closing or closed.
	}
}
