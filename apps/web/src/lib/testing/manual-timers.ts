import type { TimerApi } from '../realtime/connection-types'

interface Task {
  readonly atMs: number
  readonly callback: () => void
}

/** Deterministic timers for unit tests: time only moves on `advance`. */
export class ManualTimers implements TimerApi {
  private nowMs: number
  private nextId = 1
  private readonly tasks = new Map<number, Task>()

  constructor(startMs = 1_000_000) {
    this.nowMs = startMs
  }

  now = (): number => this.nowMs

  setTimeout = (callback: () => void, ms: number): unknown => {
    const id = this.nextId
    this.nextId += 1
    this.tasks.set(id, { atMs: this.nowMs + Math.max(0, ms), callback })
    return id
  }

  clearTimeout = (handle: unknown): void => {
    if (typeof handle === 'number') this.tasks.delete(handle)
  }

  get pending(): number {
    return this.tasks.size
  }

  /** Runs every task due within `ms`, in time order, then sets the clock. */
  advance(ms: number): void {
    const target = this.nowMs + ms
    for (;;) {
      let nextId: number | null = null
      let next: Task | null = null
      for (const [id, task] of this.tasks) {
        if (task.atMs <= target && (next === null || task.atMs < next.atMs)) {
          nextId = id
          next = task
        }
      }
      if (nextId === null || next === null) break
      this.tasks.delete(nextId)
      this.nowMs = next.atMs
      next.callback()
    }
    this.nowMs = target
  }
}
