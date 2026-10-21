import type { ImportResult } from '../backupService/types.ts'

/** How far the photos of a backup or restore have got: `done` of `total`. */
export type PhotoProgress = { done: number; total: number }

export type PhotosResult = {
  /** Photos that could not be moved; the next backup or restore tries them again. */
  failures: number
  /** Restoring only: the device ran out of space, so downloading stopped. */
  outOfSpace: boolean
}

export type RestoreResult =
  | ({ ok: true } & ImportResult)
  /** There is no OwnLedger backup in this Drive. */
  | { ok: false; reason: 'none' }
  /** The backup file is not valid OwnLedger data, so nothing was imported. */
  | { ok: false; reason: 'invalid' }
