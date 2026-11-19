'use client'

import { useCallback, useMemo, useRef, useState } from 'react'

export interface Pending {
  /** True while the command started under `key` has not settled. */
  has(key: string): boolean
  readonly any: boolean
  /**
   * Runs `task` under `key` unless one is already in flight. Resolves to
   * whether it succeeded; never rejects, because the room client already
   * turns failures into toasts.
   */
  run(key: string, task: () => Promise<unknown>): Promise<boolean>
}

/** In-flight tracking so buttons disable while their command is pending. */
export function usePending(): Pending {
  // The ref answers "is it running?" synchronously for double clicks; the
  // state copy re-renders the buttons.
  const inFlight = useRef(new Set<string>())
  const [keys, setKeys] = useState<readonly string[]>([])

  const run = useCallback(async (key: string, task: () => Promise<unknown>) => {
    if (inFlight.current.has(key)) return false
    inFlight.current.add(key)
    setKeys([...inFlight.current])
    try {
      await task()
      return true
    } catch {
      return false
    } finally {
      inFlight.current.delete(key)
      setKeys([...inFlight.current])
    }
  }, [])

  return useMemo(
    () => ({
      has: (key: string) => keys.includes(key),
      any: keys.length > 0,
      run,
    }),
    [keys, run],
  )
}
