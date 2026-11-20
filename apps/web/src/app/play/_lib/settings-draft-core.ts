import type { RoomSettings } from '@drawing-games/game-core'
import type { RoomSettingsPatch } from '@drawing-games/protocol'

import { isRoomCommandError } from '@/lib/realtime/command-error'

/**
 * Framework-free bookkeeping behind `useSettingsDraft`: the host's local
 * settings edits and where each one stands.
 */

export type SettingKey = keyof RoomSettings

/**
 * A local edit, overlaid on the room's settings until the room's own view
 * catches up:
 * - `pending`: waiting out the debounce;
 * - `sent`: in flight;
 * - `acked`: accepted; shown only while the view is still the one we had
 *   when the ack arrived (the next view already contains the change).
 */
export interface DraftEntry {
  readonly value: RoomSettings[SettingKey]
  readonly phase: 'pending' | 'sent' | 'acked'
  readonly token: number
  readonly ackedFor: RoomSettings | null
}

export type DraftEntries = Partial<Record<SettingKey, DraftEntry>>

/** Edits sent together as one `lobby.settings` patch. */
export type DraftBatch = readonly (readonly [SettingKey, DraftEntry])[]

export function entryList(entries: DraftEntries): [SettingKey, DraftEntry][] {
  return (Object.keys(entries) as SettingKey[]).flatMap((key) => {
    const entry = entries[key]
    return entry ? [[key, entry] as [SettingKey, DraftEntry]] : []
  })
}

/**
 * Marks every pending edit as sent (the batch to send now) and drops acked
 * edits the room's view has since caught up with.
 */
export function takePending(
  entries: DraftEntries,
  server: RoomSettings,
): { readonly next: DraftEntries; readonly batch: DraftBatch } {
  const next: DraftEntries = {}
  const batch: [SettingKey, DraftEntry][] = []
  for (const [key, entry] of entryList(entries)) {
    if (entry.phase === 'pending') {
      const sent: DraftEntry = { ...entry, phase: 'sent' }
      batch.push([key, sent])
      next[key] = sent
    } else if (entry.phase === 'sent' || entry.ackedFor === server) {
      next[key] = entry
    }
  }
  return { next, batch }
}

/**
 * The room answered a batch: accepted edits stay shown until the next view
 * carries them; refused ones fall back to the room's value. An edit that
 * was changed again since it was sent is left alone (its newer value is
 * still to come).
 */
export function settleBatch(
  entries: DraftEntries,
  batch: DraftBatch,
  accepted: boolean,
  server: RoomSettings,
): DraftEntries {
  const after: DraftEntries = { ...entries }
  for (const [key, sent] of batch) {
    const entry = after[key]
    if (!entry || entry.token !== sent.token) continue
    if (accepted) {
      after[key] = { ...entry, phase: 'acked', ackedFor: server }
    } else {
      delete after[key]
    }
  }
  return after
}

/** The batch's edits that nothing newer has replaced since it was sent. */
export function stillCurrent(
  entries: DraftEntries,
  batch: DraftBatch,
): DraftBatch {
  return batch.filter(([key, sent]) => entries[key]?.token === sent.token)
}

/**
 * Whether a refused batch should be tried again one edit at a time. Edits
 * made close together go out as one patch, and the room refuses a patch
 * whole when any edit in it breaks a rule (`BAD_COMMAND`); retrying each
 * alone keeps the valid ones and rolls back only the impossible one.
 * Anything else (offline, not the host any more) would fail the same way.
 */
export function shouldRetryAlone(batch: DraftBatch, error: unknown): boolean {
  return (
    batch.length > 1 &&
    isRoomCommandError(error) &&
    error.code === 'BAD_COMMAND'
  )
}

/** The room's settings with the edits still worth showing on top. */
export function mergeDraft(
  server: RoomSettings,
  entries: DraftEntries,
): RoomSettings {
  let merged: RoomSettings = server
  for (const [key, entry] of entryList(entries)) {
    if (entry.phase === 'acked' && entry.ackedFor !== server) continue
    merged = { ...merged, [key]: entry.value }
  }
  return merged
}

/** Copies readonly arrays so the patch matches the protocol's shape. */
export function toPatch(batch: DraftBatch): RoomSettingsPatch {
  const patch: Record<string, unknown> = {}
  for (const [key, entry] of batch) {
    const value = entry.value
    patch[key] = Array.isArray(value) ? [...value] : value
  }
  return patch as RoomSettingsPatch
}
