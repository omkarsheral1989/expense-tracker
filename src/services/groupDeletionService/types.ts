import type { GroupBalances } from '../balancesService/types.ts'

export type DeleteGroupResult =
  | { ok: true }
  /** There is no such group for this user (unknown, deleted for everyone, not theirs, or already deleted here). */
  | { ok: false; notFound: true; notSettled?: undefined }
  /** Someone still owes someone: the balances say who, so the dialog can list the payments left. */
  | { ok: false; notFound?: false; notSettled: true; balances: GroupBalances }

export type RestoreGroupResult =
  | { ok: true }
  /** There is no such group for this user, or it is not deleted here. */
  | { ok: false; notFound: true; message?: undefined }
  /** Another group on the user's list has its name; the message says so, ready to show. */
  | { ok: false; notFound?: false; message: string }

/** What a sync's check of a deleted group found (ADR-069). */
export type AutoRestoreResult =
  | { restored: false }
  /** Restored because another member changed it; `changedBy` is how they are named (null when nobody can be named). */
  | { restored: true; changedBy: string | null }
