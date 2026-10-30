import { eq } from 'drizzle-orm'
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core'
import {
  accounts,
  eventArrivals,
  expenseEvents,
  expensePayments,
  groupDeletions,
  expensePhotos,
  expenseShares,
  expenses,
  groupMembers,
  groups,
  people,
} from '../../db/schema.ts'
import type { Transaction } from '../groupService/types.ts'
import { mergePeople } from '../userService/utils.ts'
import { INSERT_CHUNK_SIZE } from './constants.ts'
import { backupRowsSchema } from './schemas.ts'
import type { BackupRows, ImportResult } from './types.ts'
import { isNewer, renameIds } from './utils.ts'

type SyncedRow = { id: string; updatedAt: Date; updatedBy: string }

/**
 * Adds rows to a table with the merge rule of ADR-010: a row the table does not
 * have is inserted, and one it has is replaced only when the incoming version
 * is newer. With `naturalKey`, a row that has another id but the same key (the
 * same person in the same group or expense) counts as the same row and keeps
 * the local id. `insertAs` changes what is written for a new row. Returns the
 * rows that were inserted, as they came in.
 */
async function mergeRows<Row extends SyncedRow>(
  tx: Transaction,
  table: PgTable,
  incoming: Row[],
  naturalKey?: (row: Row) => string,
  insertAs: (row: Row) => Row = (row) => row,
): Promise<Row[]> {
  const idColumn = (table as unknown as { id: AnyPgColumn }).id
  const local = (await tx.select().from(table)) as unknown as Row[]
  const byId = new Map(local.map((row) => [row.id, row]))
  const byKey = naturalKey ? new Map(local.map((row) => [naturalKey(row), row])) : null

  const inserts: Row[] = []
  const updates: Row[] = []
  for (const row of incoming) {
    const existing = byId.get(row.id) ?? byKey?.get(naturalKey!(row))
    if (!existing) inserts.push(row)
    else if (isNewer(row, existing)) updates.push({ ...row, id: existing.id })
  }

  for (let start = 0; start < inserts.length; start += INSERT_CHUNK_SIZE) {
    const chunk = inserts.slice(start, start + INSERT_CHUNK_SIZE).map(insertAs)
    await tx.insert(table).values(chunk as never)
  }
  for (const row of updates) {
    const { id, ...values } = row
    await tx.update(table).set(values as never).where(eq(idColumn, id))
  }
  return inserts
}

/**
 * Where the same email is on a local person and an incoming one with different
 * ids, the two are one person, kept under the smaller id so that every device
 * picks the same one (ADR-044). An incoming id that loses is renamed in the
 * incoming rows; a local one that loses is merged into the incoming id, which
 * first gets the local person's own details so the newer version still wins.
 */
async function joinPeopleByEmail(tx: Transaction, incoming: BackupRows['people']) {
  const renamed = new Map<string, string>()
  const local = await tx.select().from(people)
  const localByEmail = new Map(local.filter((person) => person.email).map((person) => [person.email!, person]))
  const localIds = new Set(local.map((person) => person.id))

  for (const person of incoming) {
    const match = person.email ? localByEmail.get(person.email) : undefined
    if (!match || match.id === person.id || localIds.has(person.id)) continue

    if (match.id < person.id) {
      renamed.set(person.id, match.id)
      continue
    }
    // The incoming id wins: move the local person to it, details and all.
    await tx.insert(people).values({ id: person.id, email: null, name: null, updatedBy: person.id })
    await mergePeople(tx, match.id, person.id)
    await tx
      .update(people)
      .set({
        email: match.email,
        name: match.name,
        localName: match.localName,
        picture: match.picture,
        updatedAt: match.updatedAt,
        updatedBy: match.updatedBy === match.id ? person.id : match.updatedBy,
        deletedAt: match.deletedAt,
      })
      .where(eq(people.id, person.id))
    renamed.set(match.id, person.id)
  }
  return renamed
}

/**
 * A newer person row replaces the whole row, but two of its details are not
 * one version's to take away: the name this device uses for the person (private
 * to it) and their picture (which a version written by someone who has not
 * seen it leaves empty). After the merge each is filled from what the device had
 * before or what came in, whichever exists (ADR-045, ADR-046).
 */
async function keepOwnDetails(
  tx: Transaction,
  before: Map<string, typeof people.$inferSelect>,
  incoming: BackupRows['people'],
) {
  const after = new Map((await tx.select().from(people)).map((person) => [person.id, person]))
  for (const person of incoming) {
    const now = after.get(person.id)
    if (!now) continue
    const localName = now.localName ?? before.get(person.id)?.localName ?? person.localName ?? null
    const picture = now.picture ?? before.get(person.id)?.picture ?? person.picture ?? null
    if (localName === now.localName && picture === now.picture) continue
    await tx.update(people).set({ localName, picture }).where(eq(people.id, person.id))
  }
}

/**
 * Merges a backup's rows into the device's data in one transaction: people
 * first (joined by email), then groups, memberships, expenses, shares, photos
 * and events, each by the newest version (ADR-010, ADR-044). Nothing on the
 * device is removed. A row that breaks a rule of the database (for example one
 * pointing at a missing person) makes the whole import fail and change nothing.
 */
export async function mergeBackupRows(
  tx: Transaction,
  rows: BackupRows,
  { recordArrivals = false }: { recordArrivals?: boolean } = {},
): Promise<ImportResult> {
  const renamed = await joinPeopleByEmail(tx, rows.people)
  const incoming = renamed.size ? backupRowsSchema.parse(renameIds(rows, renamed)) : rows

  const peopleBefore = new Map((await tx.select().from(people)).map((person) => [person.id, person]))

  // A person can be changed by someone further down the list, so new people
  // are inserted as changed by themselves and then given who changed them.
  const newPeople = await mergeRows(tx, people, incoming.people, undefined, (person) => ({
    ...person,
    updatedBy: person.id,
  }))
  for (const person of newPeople) {
    if (person.updatedBy === person.id) continue
    await tx.update(people).set({ updatedBy: person.updatedBy }).where(eq(people.id, person.id))
  }

  await keepOwnDetails(tx, peopleBefore, incoming.people)

  await mergeRows(tx, groups, incoming.groups)
  await mergeRows(tx, groupMembers, incoming.groupMembers, (row) => `${row.groupId}:${row.personId}`)
  await mergeRows(tx, expenses, incoming.expenses)
  await mergeRows(tx, expenseShares, incoming.expenseShares, (row) => `${row.expenseId}:${row.personId}`)
  await mergeRows(tx, expensePhotos, incoming.expensePhotos)
  // Oldest first, so a 'reverted' event's version is always there before it.
  const events = [...incoming.expenseEvents].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
  const newEvents = await mergeRows(tx, expenseEvents, events)
  // Only a member's file records when events reached the device (ADR-062), not the user's own backup.
  const arrivals = recordArrivals ? newEvents.map((event) => ({ eventId: event.id, actedBy: event.actedBy })) : []
  const arrivedAt = new Date()
  for (let start = 0; start < arrivals.length; start += INSERT_CHUNK_SIZE) {
    const chunk = arrivals.slice(start, start + INSERT_CHUNK_SIZE).map(({ eventId }) => ({ eventId, arrivedAt }))
    await tx.insert(eventArrivals).values(chunk)
  }

  // The user's own accounts, then the payment method of each expense (ADR-061).
  await mergeRows(tx, accounts, incoming.accounts)
  await mergeRows(tx, expensePayments, incoming.expensePayments, (row) => row.expenseId)
  // Which groups the user deleted on this device, one row per group (ADR-069).
  await mergeRows(tx, groupDeletions, incoming.groupDeletions, (row) => row.groupId)

  return { renamed, arrivals }
}
