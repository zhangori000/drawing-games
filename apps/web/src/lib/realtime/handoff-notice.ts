import type { RoomView } from '@drawing-games/game-core'

/**
 * When the room hands this player their team's live turn mid-way (the
 * drawer left, or lost connection past the reconnect grace), the screen
 * switches from guessing to drawing on its own. This names what happened so
 * the switch is not a surprise: "Max left the room. You're drawing now…".
 * Returns null for every other view change, including the normal rotation
 * between rounds and showdown cards.
 */
export function drawerHandoffNotice(
  previous: RoomView | null,
  next: RoomView,
): string | null {
  if (!previous?.me || !next.me) return null
  if (previous.me.memberId !== next.me.memberId) return null
  if ((previous.match?.number ?? null) !== (next.match?.number ?? null)) {
    return null
  }

  const handoff =
    roundHandoff(previous, next) ?? showdownHandoff(previous, next)
  if (!handoff) return null
  const stillHere = next.members.some((member) => member.id === handoff.fromId)
  const why = stillHere ? 'lost connection' : 'left the room'
  return `${handoff.fromName} ${why}. ${handoff.task}`
}

interface Handoff {
  readonly fromId: string
  readonly fromName: string
  readonly task: string
}

const TURN_PHASES: ReadonlySet<RoomView['phase']> = new Set([
  'word-draft',
  'drawing',
])

function roundHandoff(previous: RoomView, next: RoomView): Handoff | null {
  if (!TURN_PHASES.has(previous.phase) || !TURN_PHASES.has(next.phase)) {
    return null
  }
  const before = previous.round
  const after = next.round
  if (!before?.mine || !after?.mine || before.number !== after.number) {
    return null
  }
  if (before.mine.team !== after.mine.team) return null
  if (before.mine.amDrawer || !after.mine.amDrawer) return null
  return {
    fromId: before.mine.drawerId,
    fromName: before.mine.drawerName,
    task:
      next.phase === 'word-draft'
        ? 'You’re picking your team’s word now.'
        : 'You’re drawing now: same word, same canvas.',
  }
}

function showdownHandoff(previous: RoomView, next: RoomView): Handoff | null {
  if (previous.phase !== 'showdown' || next.phase !== 'showdown') return null
  const before = previous.showdown?.mine
  const after = next.showdown?.mine
  if (!before || !after || before.team !== after.team) return null
  if (before.cardIndex !== after.cardIndex || after.finished) return null
  if (before.amDrawer || !after.amDrawer || before.drawerId === null) {
    return null
  }
  return {
    fromId: before.drawerId,
    fromName: before.drawerName ?? 'Your drawer',
    task: 'You’re drawing this card now.',
  }
}
