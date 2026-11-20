'use client'

import type { RoomSettings } from '@drawing-games/game-core'
import type { RoomSettingsPatch } from '@drawing-games/protocol'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  entryList,
  mergeDraft,
  settleBatch,
  shouldRetryAlone,
  stillCurrent,
  takePending,
  toPatch,
  type DraftBatch,
  type DraftEntries,
  type SettingKey,
} from './settings-draft-core'

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
 * value. When the room refuses a merged patch for a rule, each edit in it is
 * tried again on its own, so only the impossible one rolls back.
 */
export function useSettingsDraft(
  server: RoomSettings,
  send: (patch: RoomSettingsPatch) => Promise<void>,
  delayMs = SETTINGS_DEBOUNCE_MS,
): SettingsDraft {
  const [entries, setEntries] = useState<DraftEntries>({})
  const entriesRef = useRef<DraftEntries>({})
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

  const commit = useCallback((next: DraftEntries) => {
    entriesRef.current = next
    setEntries(next)
  }, [])

  /** Sends edits as one patch; resolves once the room has answered them. */
  const sendBatch = useCallback(
    (batch: DraftBatch): Promise<void> => {
      const attempt = (edits: DraftBatch): Promise<void> =>
        send(toPatch(edits)).then(
          () => {
            commit(
              settleBatch(entriesRef.current, edits, true, serverRef.current),
            )
          },
          (error: unknown) => {
            if (shouldRetryAlone(edits, error)) {
              const retries = stillCurrent(entriesRef.current, edits).map(
                (edit) => attempt([edit]),
              )
              return Promise.all(retries).then(() => undefined)
            }
            commit(
              settleBatch(entriesRef.current, edits, false, serverRef.current),
            )
          },
        )
      return attempt(batch)
    },
    [commit, send],
  )

  const flush = useCallback((): Promise<void> => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    const { next, batch } = takePending(entriesRef.current, serverRef.current)
    commit(next)
    if (batch.length > 0) {
      const request = sendBatch(batch)
      inFlight.current.add(request)
      void request.finally(() => inFlight.current.delete(request))
    }
    return Promise.all([...inFlight.current]).then(() => undefined)
  }, [commit, sendBatch])

  const update = useCallback(
    (patch: Partial<RoomSettings>) => {
      const next: DraftEntries = { ...entriesRef.current }
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

  const settings = useMemo(() => mergeDraft(server, entries), [server, entries])

  const saving = entryList(entries).some(([, entry]) => entry.phase !== 'acked')

  return { settings, saving, update, flush }
}
