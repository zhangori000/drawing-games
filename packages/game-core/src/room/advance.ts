import { runBotItem } from './bot-runner'
import { takeNextBotItem } from './bots'
import { ABANDON_MATCH_MS, HOST_TRANSFER_MS } from './constants'
import type { RoomContext } from './context'
import { patchState } from './context'
import { autoPickAndStartDrawing } from './draft'
import { nextDrawerTakeover, runDrawerTakeover } from './drawer-handoff'
import { endRound } from './drawing'
import { activeMembers, chooseHost, findActiveMember } from './members'
import { continueAfterResults } from './results'
import { abandonMatch } from './match'
import { isMatchRunning } from './selectors'
import { endShowdown } from './showdown'
import type { RoomState } from './types'
import { nextVoteResolution, runVoteResolution } from './votes'

/** Safety valve: a settled room needs far fewer steps than this. */
const MAX_STEPS_PER_ADVANCE = 100_000

/**
 * When a disconnected host should hand over: 15 s after they dropped, but
 * not before some other human has been continuously connected.
 */
function hostTransferDueAtMs(state: RoomState): number | null {
  if (state.hostId === null) return null
  const host = findActiveMember(state, state.hostId)
  if (host === undefined || host.connected) return null
  const others = activeMembers(state).filter(
    (member) =>
      member.kind === 'human' && member.id !== host.id && member.connected,
  )
  if (others.length === 0) return null
  const connectedSince = Math.min(
    ...others.map((member) => member.lastSeenAtMs),
  )
  return Math.max(host.lastSeenAtMs + HOST_TRANSFER_MS, connectedSince)
}

/**
 * When a running match with no connected human is abandoned: a minute after
 * the last human dropped, or right away once every human has left.
 */
function abandonDueAtMs(state: RoomState): number | null {
  if (!isMatchRunning(state)) return null
  const humans = state.members.filter((member) => member.kind === 'human')
  if (humans.some((member) => member.connected)) return null
  if (humans.length === 0) return state.match?.startedAtMs ?? null
  const lastSeen = Math.max(...humans.map((member) => member.lastSeenAtMs))
  const anyoneMayReturn = humans.some((member) => member.left !== true)
  return anyoneMayReturn ? lastSeen + ABANDON_MATCH_MS : lastSeen
}

type DueKind = 'deadline' | 'abandon' | 'host' | 'drawer' | 'votes' | 'bot'

interface DueWork {
  readonly kind: DueKind
  readonly atMs: number
}

/**
 * Earliest pending work; ties go deadline → abandon → host → drawer →
 * votes → bot.
 */
function nextDueWork(state: RoomState): DueWork | null {
  const candidates: DueWork[] = []
  if (state.phaseDeadlineAtMs !== null) {
    candidates.push({ kind: 'deadline', atMs: state.phaseDeadlineAtMs })
  }
  const abandonAt = abandonDueAtMs(state)
  if (abandonAt !== null) candidates.push({ kind: 'abandon', atMs: abandonAt })
  const hostAt = hostTransferDueAtMs(state)
  if (hostAt !== null) candidates.push({ kind: 'host', atMs: hostAt })
  const takeover = nextDrawerTakeover(state)
  if (takeover !== null) {
    candidates.push({ kind: 'drawer', atMs: takeover.atMs })
  }
  const vote = nextVoteResolution(state)
  if (vote !== null) candidates.push({ kind: 'votes', atMs: vote.atMs })
  const bot = state.bots.schedule[0]
  if (bot !== undefined) candidates.push({ kind: 'bot', atMs: bot.atMs })
  let best: DueWork | null = null
  for (const candidate of candidates) {
    if (best === null || candidate.atMs < best.atMs) best = candidate
  }
  return best
}

export function nextWakeAtMs(state: RoomState): number | null {
  return nextDueWork(state)?.atMs ?? null
}

function runDeadline(ctx: RoomContext): void {
  switch (ctx.state.phase) {
    case 'word-draft':
      autoPickAndStartDrawing(ctx)
      return
    case 'drawing':
      endRound(ctx)
      return
    case 'round-results':
      continueAfterResults(ctx)
      return
    case 'showdown':
      endShowdown(ctx)
      return
    case 'lobby':
    case 'stats':
      patchState(ctx, { phaseDeadlineAtMs: null })
  }
}

function runHostTransfer(ctx: RoomContext): void {
  const current = ctx.state.hostId
  patchState(ctx, { hostId: chooseHost(ctx.state, current) })
}

/**
 * Processes every piece of work due at or before `untilMs` in time order,
 * each at its own scheduled time, so a late alarm never changes outcomes.
 * `floorMs` keeps time from running backwards after a command at that time,
 * and work that only became due through earlier work (whose time may have
 * passed) runs at the time it was caused, never earlier.
 * Each processed item is one state change (`seq` + 1, `changedAtMs`).
 */
export function runDueWork(
  ctx: RoomContext,
  untilMs: number,
  floorMs: number = Number.NEGATIVE_INFINITY,
): void {
  let floor = floorMs
  for (let step = 0; step < MAX_STEPS_PER_ADVANCE; step += 1) {
    const due = nextDueWork(ctx.state)
    if (due === null || due.atMs > untilMs) return
    ctx.now = Math.max(floor, due.atMs)
    floor = ctx.now
    switch (due.kind) {
      case 'deadline':
        runDeadline(ctx)
        break
      case 'abandon':
        abandonMatch(ctx)
        break
      case 'host':
        runHostTransfer(ctx)
        break
      case 'drawer': {
        const takeover = nextDrawerTakeover(ctx.state)
        if (takeover !== null) runDrawerTakeover(ctx, takeover)
        break
      }
      case 'votes': {
        const vote = nextVoteResolution(ctx.state)
        if (vote !== null) runVoteResolution(ctx, vote)
        break
      }
      case 'bot': {
        const item = takeNextBotItem(ctx)
        if (item !== null) runBotItem(ctx, item)
        break
      }
    }
    patchState(ctx, { seq: ctx.state.seq + 1, changedAtMs: ctx.now })
  }
  throw new Error('advanceRoom did not settle')
}
