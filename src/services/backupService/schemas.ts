import { z } from 'zod'
import { EXPENSE_EVENT_KINDS, GROUP_TYPES, SPLIT_METHODS } from '../../db/constants.ts'
import { BACKUP_APP, BACKUP_FORMAT, BACKUP_KIND, GROUP_FILE_KIND } from './constants.ts'

// A backup is downloaded from Drive, so it is untrusted (CLAUDE.md, ADR-010):
// every row is checked here, and the database's constraints check the rest.

const timestamp = z.iso.datetime({ offset: true }).transform((value) => new Date(value))
const day = z.iso.date()
const minor = z.number().int()

const syncColumns = {
  id: z.uuid(),
  updatedAt: timestamp,
  updatedBy: z.uuid(),
  deletedAt: timestamp.nullable(),
}

const snapshotSchema = z.object({
  description: z.string(),
  category: z.string(),
  amountMinor: minor,
  currency: z.string(),
  date: day,
  notes: z.string().nullable(),
  method: z.enum(SPLIT_METHODS),
  shares: z.array(
    z.object({
      personId: z.uuid(),
      paidMinor: minor,
      owedMinor: minor,
      inputValue: minor.nullable(),
    }),
  ),
  photos: z.array(
    z.object({
      id: z.uuid(),
      position: z.number().int(),
      mimeType: z.string(),
      sizeBytes: z.number().int(),
    }),
  ),
})

const changeSchema = z.object({
  field: z.enum(['description', 'category', 'amount', 'currency', 'date', 'notes', 'paidBy', 'split', 'receipts']),
  from: z.unknown(),
  to: z.unknown(),
})

export const backupRowsSchema = z.object({
  people: z.array(
    z.object({ ...syncColumns, email: z.string().nullable(), name: z.string().nullable() }),
  ),
  groups: z.array(
    z.object({
      ...syncColumns,
      name: z.string(),
      type: z.enum(GROUP_TYPES),
      defaultCurrency: z.string(),
      createdBy: z.uuid(),
    }),
  ),
  groupMembers: z.array(z.object({ ...syncColumns, groupId: z.uuid(), personId: z.uuid() })),
  expenses: z.array(
    z.object({
      ...syncColumns,
      groupId: z.uuid(),
      description: z.string(),
      category: z.string(),
      amountMinor: minor,
      currency: z.string(),
      date: day,
      notes: z.string().nullable(),
      method: z.enum(SPLIT_METHODS),
      createdBy: z.uuid(),
      createdAt: timestamp,
    }),
  ),
  expenseShares: z.array(
    z.object({
      ...syncColumns,
      expenseId: z.uuid(),
      personId: z.uuid(),
      paidMinor: minor,
      owedMinor: minor,
      inputValue: minor.nullable(),
    }),
  ),
  expensePhotos: z.array(
    z.object({
      ...syncColumns,
      expenseId: z.uuid(),
      position: z.number().int(),
      mimeType: z.string(),
      sizeBytes: z.number().int(),
    }),
  ),
  expenseEvents: z.array(
    z.object({
      ...syncColumns,
      groupId: z.uuid(),
      expenseId: z.uuid(),
      kind: z.enum(EXPENSE_EVENT_KINDS),
      actedBy: z.uuid(),
      occurredAt: timestamp,
      snapshot: snapshotSchema,
      changes: z.array(changeSchema),
      restoredFrom: z.uuid().nullable(),
    }),
  ),
})

export const backupFileSchema = z.object({
  app: z.literal(BACKUP_APP),
  kind: z.literal(BACKUP_KIND),
  format: z.literal(BACKUP_FORMAT),
  writtenAt: timestamp,
  writtenBy: z.uuid(),
  rows: backupRowsSchema,
})

/** A member's file of a group: the whole group as the writer's device knows it (ADR-044). */
export const groupFileSchema = z.object({
  app: z.literal(BACKUP_APP),
  kind: z.literal(GROUP_FILE_KIND),
  format: z.literal(BACKUP_FORMAT),
  groupId: z.uuid(),
  writtenAt: timestamp,
  writtenBy: z.uuid(),
  rows: backupRowsSchema,
})
