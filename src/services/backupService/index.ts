import { eq, inArray } from 'drizzle-orm'
import type { Database } from '../../db/client.ts'
import {
  accounts,
  expenseEvents,
  expensePayments,
  expensePhotos,
  expenseShares,
  expenses,
  groupMembers,
  groups,
  people,
  syncStatus,
} from '../../db/schema.ts'
import { BACKUP_APP, BACKUP_FORMAT, BACKUP_KIND, GROUP_FILE_KIND } from './constants.ts'
import { mergeBackupRows } from './merge.ts'
import { backupFileSchema, groupFileSchema } from './schemas.ts'
import type { BackupFile, GroupFile, ImportResult } from './types.ts'
import { idsIn, rowsOfGroup } from './utils.ts'

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
        accounts: await tx.select().from(accounts),
        expensePayments: await tx.select().from(expensePayments),
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

  /**
   * A member's file of a group (ADR-044): the whole group as this device knows
   * it, deleted rows and history included, and every person its rows name
   * (nobody else known on the device).
   */
  async exportGroup(db: Database, groupId: string, writtenBy: string): Promise<GroupFile> {
    return db.transaction(async (tx) => {
      const groupExpenses = await tx.select().from(expenses).where(eq(expenses.groupId, groupId))
      const expenseIds = groupExpenses.map((expense) => expense.id)
      const ofExpenses = expenseIds.length > 0
      const rows = {
        groups: await tx.select().from(groups).where(eq(groups.id, groupId)),
        groupMembers: await tx.select().from(groupMembers).where(eq(groupMembers.groupId, groupId)),
        expenses: groupExpenses,
        expenseShares: ofExpenses
          ? await tx.select().from(expenseShares).where(inArray(expenseShares.expenseId, expenseIds))
          : [],
        expensePhotos: ofExpenses
          ? await tx.select().from(expensePhotos).where(inArray(expensePhotos.expenseId, expenseIds))
          : [],
        expenseEvents: await tx.select().from(expenseEvents).where(eq(expenseEvents.groupId, groupId)),
      }
      const named = [...idsIn(rows)]
      const namedPeople = named.length ? await tx.select().from(people).where(inArray(people.id, named)) : []
      return {
        app: BACKUP_APP,
        kind: GROUP_FILE_KIND,
        format: BACKUP_FORMAT,
        groupId,
        writtenAt: new Date(),
        writtenBy,
        // A local name is private to the device (ADR-045): it never goes into a group's file.
        // Nor do the user's accounts and payment methods (ADR-061): they are private to the user.
        rows: {
          people: namedPeople.map((person) => ({ ...person, localName: undefined })),
          ...rows,
          accounts: [],
          expensePayments: [],
        },
      }
    })
  },

  /** A member's file of this group, checked, or null when it is not valid OwnLedger data for it. */
  parseGroupFile(text: string, groupId: string): GroupFile | null {
    try {
      const parsed = groupFileSchema.safeParse(JSON.parse(text))
      return parsed.success && parsed.data.groupId === groupId ? parsed.data : null
    } catch {
      return null // not JSON
    }
  },

  /**
   * Merges a member's file into the device's data, all or nothing, taking only
   * the rows of its group (`rowsOfGroup`): a file cannot change anything else.
   */
  importGroup(db: Database, file: GroupFile): Promise<ImportResult> {
    return db.transaction((tx) => mergeBackupRows(tx, rowsOfGroup(file.rows, file.groupId), { recordArrivals: true }))
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
