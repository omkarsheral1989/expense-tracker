import type { Database } from '../../db/client.ts'

export type DatabaseSessionState =
  | { status: 'loading' }
  | { status: 'ready'; db: Database }
  /** Another tab already has this data open. */
  | { status: 'locked' }
  | { status: 'error'; error: Error }
