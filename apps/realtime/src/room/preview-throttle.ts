import { PREVIEW_INTERVAL_MS } from './constants';
import { describeError } from './log';

export interface TimerApi {
	setTimeout(callback: () => void, ms: number): unknown;
	clearTimeout(handle: unknown): void;
}

const globalTimers: TimerApi = {
	setTimeout: (callback, ms) => setTimeout(callback, ms),
	clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * At most one preview per canvas per interval, with a trailing flush: a
 * request inside the window schedules exactly one send at its end, which
 * reflects whatever the canvas looks like by then.
 */
export class PreviewThrottle {
	private readonly lastSentAtMs = new Map<string, number>();
	private readonly pending = new Map<string, unknown>();

	constructor(
		private readonly send: (canvasId: string) => void,
		private readonly now: () => number = () => Date.now(),
		private readonly intervalMs: number = PREVIEW_INTERVAL_MS,
		private readonly timers: TimerApi = globalTimers,
	) {}

	request(canvasId: string): void {
		if (this.pending.has(canvasId)) return;
		const last = this.lastSentAtMs.get(canvasId);
		const wait = last === undefined ? 0 : last + this.intervalMs - this.now();
		if (wait <= 0) {
			this.fire(canvasId);
			return;
		}
		const handle = this.timers.setTimeout(() => {
			this.pending.delete(canvasId);
			this.fire(canvasId);
		}, wait);
		this.pending.set(canvasId, handle);
	}

	/** Cancels trailing sends and forgets history (new match, room reset). */
	clear(): void {
		for (const handle of this.pending.values()) this.timers.clearTimeout(handle);
		this.pending.clear();
		this.lastSentAtMs.clear();
	}

	private fire(canvasId: string): void {
		this.lastSentAtMs.set(canvasId, this.now());
		try {
			this.send(canvasId);
		} catch (error) {
			// Runs from a timer, where nothing else would catch it.
			console.error('room: preview send failed', describeError(error));
		}
	}
}
