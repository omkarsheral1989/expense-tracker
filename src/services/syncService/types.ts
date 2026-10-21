import type { ImportResult } from '../backupService/types.ts'

export type RestoreResult =
  | ({ ok: true } & ImportResult)
  /** There is no OwnLedger backup in this Drive. */
  | { ok: false; reason: 'none' }
  /** The backup file is not valid OwnLedger data, so nothing was imported. */
  | { ok: false; reason: 'invalid' }
