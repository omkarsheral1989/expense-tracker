import { useEffect, useState } from 'react'
import { databaseSession } from '../../db/session.ts'
import type { DatabaseSessionState } from './types.ts'

/**
 * Opens the device's database while the component is mounted and closes it
 * afterwards. `retry` tries again after `locked` or `error`.
 */
export function useDatabaseSession(datasetId: string) {
  const [attempt, setAttempt] = useState(0)
  // Each result is stored with the dataset and attempt it belongs to, so a
  // result from an earlier one is never mistaken for the current state.
  const key = `${datasetId}:${attempt}`
  const [result, setResult] = useState<{
    key: string
    state: DatabaseSessionState
  } | null>(null)

  useEffect(() => {
    let cancelled = false

    databaseSession.start(datasetId).then(
      (session) => {
        if (!cancelled) setResult({ key, state: session })
      },
      (error: unknown) => {
        if (cancelled) return
        const state = {
          status: 'error',
          error: error instanceof Error ? error : new Error(String(error)),
        } as const
        setResult({ key, state })
      },
    )

    return () => {
      cancelled = true
      databaseSession.end()
    }
  }, [datasetId, key])

  const state: DatabaseSessionState =
    result?.key === key ? result.state : { status: 'loading' }

  return { state, retry: () => setAttempt((count) => count + 1) }
}
