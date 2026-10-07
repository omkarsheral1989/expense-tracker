import type { Database } from '../../db/client.ts'

export type DatabaseSessionState =
  | { status: 'loading' }
  | { status: 'ready'; db: Database }
  /** Another tab already has this account's database open. */
  | { status: 'locked' }
  | { status: 'error'; error: Error }
