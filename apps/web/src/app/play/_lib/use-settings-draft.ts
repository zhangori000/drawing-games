'use client'

import type { RoomSettings } from '@drawing-games/game-core'
import type { RoomSettingsPatch } from '@drawing-games/protocol'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type SettingKey = keyof RoomSettings

/**
 * A local edit, overlaid on the room's settings until the room's own view
 * catches up:
 * - `pending`: waiting out the debounce;
 * - `sent`: in flight;
 * - `acked`: accepted; shown only while the view is still the one we had
 *   when the ack arrived (the next view already contains the change).
 */
interface Entry {
  readonly value: RoomSettings[SettingKey]
  readonly phase: 'pending' | 'sent' | 'acked'
  readonly token: number
  readonly ackedFor: RoomSettings | null
}

type Entries = Partial<Record<SettingKey, Entry>>

export interface SettingsDraft {
  /** The room's settings with this host's unsent or unconfirmed edits on top. */
  readonly settings: RoomSettings
  /** Some edit has not reached the room yet. */
  readonly saving: boolean
  update(patch: Partial<RoomSettings>): void
  /** Sends any debounced edits now and waits for the room's answer. */
  flush(): Promise<void>
}

export const SETTINGS_DEBOUNCE_MS = 300

/**
 * Debounced host settings edits (~300 ms), merged into one patch. Failures
 * are toasted by the room client; the control then falls back to the room's
 * value.
 */
export function useSettingsDraft(
  server: RoomSettings,
  send: (patch: RoomSettingsPatch) => Promise<void>,
  delayMs = SETTINGS_DEBOUNCE_MS,
): SettingsDraft {
  const [entries, setEntries] = useState<Entries>({})
  const entriesRef = useRef<Entries>({})
  const serverRef = useRef(server)
  const timer = useRef<number | null>(null)
  const inFlight = useRef(new Set<Promise<void>>())
  const nextToken = useRef(1)

  useEffect(() => {
    serverRef.current = server
  }, [server])

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )

  const commit = useCallback((next: Entries) => {
    entriesRef.current = next
    setEntries(next)
  }, [])

  const flush = useCallback((): Promise<void> => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    const current = entriesRef.current
    const toSend: Partial<Record<SettingKey, Entry>> = {}
    const next: Entries = {}
    for (const [key, entry] of entryList(current)) {
      if (entry.phase === 'pending') {
        const sent: Entry = { ...entry, phase: 'sent' }
        toSend[key] = sent
        next[key] = sent
      } else if (
        entry.phase === 'sent' ||
        entry.ackedFor === serverRef.current
      ) {
        next[key] = entry
      }
    }
    const sentKeys = entryList(toSend)
    if (sentKeys.length === 0) {
      commit(next)
      return Promise.all([...inFlight.current]).then(() => undefined)
    }
    commit(next)

    const settle = (accepted: boolean) => {
      const after: Entries = { ...entriesRef.current }
      for (const [key, sent] of sentKeys) {
        const entry = after[key]
        if (!entry || entry.token !== sent.token) continue
        if (accepted) {
          after[key] = { ...entry, phase: 'acked', ackedFor: serverRef.current }
        } else {
          delete after[key]
        }
      }
      commit(after)
    }

    const patch = toPatch(sentKeys.map(([key, entry]) => [key, entry.value]))
    const request = send(patch).then(
      () => settle(true),
      () => settle(false),
    )
    inFlight.current.add(request)
    void request.finally(() => inFlight.current.delete(request))
    return Promise.all([...inFlight.current]).then(() => undefined)
  }, [commit, send])

  const update = useCallback(
    (patch: Partial<RoomSettings>) => {
      const next: Entries = { ...entriesRef.current }
      for (const key of Object.keys(patch) as SettingKey[]) {
        const value = patch[key]
        if (value === undefined) continue
        next[key] = {
          value,
          phase: 'pending',
          token: nextToken.current++,
          ackedFor: null,
        }
      }
      commit(next)
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        timer.current = null
        void flush()
      }, delayMs)
    },
    [commit, delayMs, flush],
  )

  const settings = useMemo(() => {
    let merged: RoomSettings = server
    for (const [key, entry] of entryList(entries)) {
      if (entry.phase === 'acked' && entry.ackedFor !== server) continue
      merged = { ...merged, [key]: entry.value }
    }
    return merged
  }, [server, entries])

  const saving = entryList(entries).some(([, entry]) => entry.phase !== 'acked')

  return { settings, saving, update, flush }
}

function entryList(entries: Entries): [SettingKey, Entry][] {
  return (Object.keys(entries) as SettingKey[]).flatMap((key) => {
    const entry = entries[key]
    return entry ? [[key, entry] as [SettingKey, Entry]] : []
  })
}

/** Copies readonly arrays so the patch matches the protocol's shape. */
function toPatch(
  values: readonly (readonly [SettingKey, RoomSettings[SettingKey]])[],
): RoomSettingsPatch {
  const patch: Record<string, unknown> = {}
  for (const [key, value] of values) {
    patch[key] = Array.isArray(value) ? [...value] : value
  }
  return patch as RoomSettingsPatch
}
