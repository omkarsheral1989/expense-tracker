import { useEffect, useState } from 'react'
import { databaseSession } from '../../db/session.ts'
import type { DatabaseSessionState } from './types.ts'

/**
 * Opens the account's database while the component is mounted and closes it
 * afterwards. `retry` tries again after `locked` or `error`.
 */
export function useDatabaseSession(accountId: string) {
  const [attempt, setAttempt] = useState(0)
  // Each result is stored with the account and attempt it belongs to, so a
  // result from an earlier one is never mistaken for the current state.
  const key = `${accountId}:${attempt}`
  const [result, setResult] = useState<{
    key: string
    state: DatabaseSessionState
  } | null>(null)

  useEffect(() => {
    let cancelled = false

    databaseSession.start(accountId).then(
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
  }, [accountId, key])

  const state: DatabaseSessionState =
    result?.key === key ? result.state : { status: 'loading' }

  return { state, retry: () => setAttempt((count) => count + 1) }
}
