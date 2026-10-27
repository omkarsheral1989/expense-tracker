import type { ImportResult } from '../backupService/types.ts'

/** How far the photos of a backup or restore have got: photo `current` of `total` is being moved (never 0, never past `total`). */
export type PhotoProgress = { current: number; total: number }

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

/** Which way a group's photos are going: up to its folder, or down to the device. */
export type PhotoDirection = 'sending' | 'receiving'

/** Where a group's sync has got to: reading the members' files, or writing the user's own. */
export type GroupSyncStep = 'receiving' | 'sending'

export type GroupSyncResult =
  | {
      status: 'synced'
      /** First names of the people the folder was just shared with. */
      sharedWith: string[]
      /** First names of the members whose file was not valid OwnLedger data, so it was skipped. */
      unreadable: string[]
      /** People who now have another id, as for a restore (old id → new id). */
      renamed: Map<string, string>
      /** Events by other members this sync brought onto the device (ADR-062). */
      newEvents: number
    }
  /** The group's folder does not exist yet, and only its creator makes it (ADR-044). */
  | { status: 'waiting'; creatorName: string }

/** A group found shared with the user and brought onto the device. */
export type FoundGroup = { groupId: string; name: string }
