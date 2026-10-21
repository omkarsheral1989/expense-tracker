import { eq } from 'drizzle-orm'
import type { Database } from '../../db/client.ts'
import {
  expenseEvents,
  expensePhotos,
  expenseShares,
  expenses,
  groupMembers,
  groups,
  people,
  syncStatus,
} from '../../db/schema.ts'
import { BACKUP_APP, BACKUP_FORMAT, BACKUP_KIND } from './constants.ts'
import { mergeBackupRows } from './merge.ts'
import { backupFileSchema } from './schemas.ts'
import type { BackupFile, ImportResult } from './types.ts'

const BACKUP_SCOPE = 'backup'

/**
 * The device's data as a backup file and back (ADR-044): every synced row of
 * every table, deleted ones included, written as JSON; and merging such a file
 * into the data, where the newer version of each row wins and nothing is removed.
 */
export const backupService = {
  /** Everything on the device, ready to be written as JSON. */
  async exportAll(db: Database, writtenBy: string): Promise<BackupFile> {
    return db.transaction(async (tx) => ({
      app: BACKUP_APP,
      kind: BACKUP_KIND,
      format: BACKUP_FORMAT,
      writtenAt: new Date(),
      writtenBy,
      rows: {
        people: await tx.select().from(people),
        groups: await tx.select().from(groups),
        groupMembers: await tx.select().from(groupMembers),
        expenses: await tx.select().from(expenses),
        expenseShares: await tx.select().from(expenseShares),
        expensePhotos: await tx.select().from(expensePhotos),
        expenseEvents: await tx.select().from(expenseEvents),
      },
    }))
  },

  /** A backup file's text, checked, or null when it is not a valid OwnLedger backup. */
  parse(text: string): BackupFile | null {
    try {
      const parsed = backupFileSchema.safeParse(JSON.parse(text))
      return parsed.success ? parsed.data : null
    } catch {
      return null // not JSON
    }
  },

  /** Merges a backup into the device's data, all or nothing. */
  importAll(db: Database, file: BackupFile): Promise<ImportResult> {
    return db.transaction((tx) => mergeBackupRows(tx, file.rows))
  },

  /** When this device last finished a backup, or null if it never has. */
  async lastBackedUpAt(db: Database): Promise<Date | null> {
    const [row] = await db.select().from(syncStatus).where(eq(syncStatus.scope, BACKUP_SCOPE))
    return row?.lastSyncedAt ?? null
  },

  /** Remembers that a backup finished at `at`. */
  async recordBackup(db: Database, at: Date): Promise<void> {
    await db
      .insert(syncStatus)
      .values({ scope: BACKUP_SCOPE, lastSyncedAt: at })
      .onConflictDoUpdate({ target: syncStatus.scope, set: { lastSyncedAt: at } })
  },
}
