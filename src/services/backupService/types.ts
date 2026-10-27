import type { z } from 'zod'
import type { backupFileSchema, backupRowsSchema, groupFileSchema } from './schemas.ts'

/** Every synced row of the device's data, table by table, as a backup holds them. */
export type BackupRows = z.output<typeof backupRowsSchema>

/** A backup file as read from Drive, once checked. */
export type BackupFile = z.output<typeof backupFileSchema>

/** A member's file of a group as read from Drive, once checked. */
export type GroupFile = z.output<typeof groupFileSchema>

export type ImportResult = {
  /**
   * People who now have another id, because the same email arrived under two
   * ids and the two became one person (ADR-044): old id → id they have now.
   */
  renamed: Map<string, string>
  /**
   * The events a member's file added to the device, with who acted: each now has an
   * arrival time (ADR-062). Empty for the user's own backup, which records none.
   */
  arrivals: { eventId: string; actedBy: string }[]
}
