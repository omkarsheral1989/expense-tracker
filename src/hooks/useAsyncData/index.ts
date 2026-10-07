import { useEffect, useEffectEvent, useState } from 'react'
import type { AsyncState } from './types.ts'

/**
 * Runs `load` once when the component mounts, and again whenever `key` changes
 * or `retry` is called, and reports `loading`, `ready` (with the data) or
 * `error`. A slower earlier load never overwrites a newer one. Meant for pages
 * that read the database when they open.
 *
 * `key` names what is being loaded (for example the user's email or a group's
 * id): use whatever `load` depends on.
 */
export function useAsyncData<T>(load: () => Promise<T>, key: string) {
  const [attempt, setAttempt] = useState(0)
  // Each result is stored with the key and attempt it belongs to, so a result
  // from an earlier one is never mistaken for the current state.
  const resultKey = `${key}:${attempt}`
  const [result, setResult] = useState<{
    key: string
    state: AsyncState<T>
  } | null>(null)

  // Always calls the newest `load`, without making the effect depend on it.
  const run = useEffectEvent(load)

  useEffect(() => {
    let cancelled = false

    run().then(
      (data) => {
        if (!cancelled) setResult({ key: resultKey, state: { status: 'ready', data } })
      },
      (error: unknown) => {
        if (cancelled) return
        const state: AsyncState<T> = {
          status: 'error',
          error: error instanceof Error ? error : new Error(String(error)),
        }
        setResult({ key: resultKey, state })
      },
    )

    return () => {
      cancelled = true
    }
  }, [resultKey])

  const state: AsyncState<T> =
    result?.key === resultKey ? result.state : { status: 'loading' }

  return { state, retry: () => setAttempt((count) => count + 1) }
}
