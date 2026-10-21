import type { z } from 'zod'
import type { backupFileSchema, backupRowsSchema } from './schemas.ts'

/** Every synced row of the device's data, table by table, as a backup holds them. */
export type BackupRows = z.output<typeof backupRowsSchema>

/** A backup file as read from Drive, once checked. */
export type BackupFile = z.output<typeof backupFileSchema>

export type ImportResult = {
  /**
   * People who now have another id, because the same email arrived under two
   * ids and the two became one person (ADR-044): old id → id they have now.
   */
  renamed: Map<string, string>
}
