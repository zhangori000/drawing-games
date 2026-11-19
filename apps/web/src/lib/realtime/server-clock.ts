/**
 * Estimates `serverTime - localTime` from envelope timestamps so countdowns
 * follow the room's authoritative deadlines even when the device clock is
 * wrong.
 *
 * Each sample is `serverTimeMs - receivedAtMs` (true offset minus one-way
 * latency). Samples are smoothed with an EWMA; a sample far from the estimate
 * is treated as a latency spike and ignored, unless several in a row agree,
 * which means the device clock actually jumped (sleep, manual change).
 */
export interface ServerClockOptions {
  readonly alpha?: number
  readonly outlierMs?: number
  readonly outliersBeforeReset?: number
}

export class ServerClock {
  private offsetMs = 0
  private samples = 0
  private consecutiveOutliers = 0
  private readonly alpha: number
  private readonly outlierMs: number
  private readonly outliersBeforeReset: number

  constructor(options: ServerClockOptions = {}) {
    this.alpha = options.alpha ?? 0.2
    this.outlierMs = options.outlierMs ?? 1_000
    this.outliersBeforeReset = options.outliersBeforeReset ?? 3
  }

  /** Feed one envelope timestamp. */
  observe(serverTimeMs: number, receivedAtMs: number): void {
    if (!Number.isFinite(serverTimeMs) || !Number.isFinite(receivedAtMs)) {
      return
    }
    const sample = serverTimeMs - receivedAtMs

    if (this.samples === 0) {
      this.offsetMs = sample
      this.samples = 1
      return
    }

    if (Math.abs(sample - this.offsetMs) > this.outlierMs) {
      this.consecutiveOutliers += 1
      if (this.consecutiveOutliers >= this.outliersBeforeReset) {
        this.offsetMs = sample
        this.samples = 1
        this.consecutiveOutliers = 0
      }
      return
    }

    this.consecutiveOutliers = 0
    // Warm up quickly: the first few samples are averaged, then EWMA.
    const weight = Math.max(this.alpha, 1 / (this.samples + 1))
    this.offsetMs += (sample - this.offsetMs) * weight
    this.samples += 1
  }

  get hasSamples(): boolean {
    return this.samples > 0
  }

  get offset(): number {
    return this.offsetMs
  }

  /** Current server time estimate in epoch milliseconds. */
  now(localNowMs: number = Date.now()): number {
    return Math.round(localNowMs + this.offsetMs)
  }
}
