import { PGlite } from '@electric-sql/pglite'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase, type Database } from '../../../db/client.ts'
import { expenseEvents, expensePhotos, expenseShares, groupMembers, groups, people } from '../../../db/schema.ts'
import { addTestExpense, addTestSettlement, expenseInput, personIdOf } from '../../../testing/expenses.ts'
import { addTestPerson, createTestGroup } from '../../../testing/groups.ts'
import { expenseService } from '../../expenseService'
import { backupService } from '../index.ts'
import type { BackupRows } from '../types.ts'

// These tests keep the backup complete as the app grows (ADR-044): they read
// the tables and columns from the database itself, so a table or column added
// later and forgotten in the backup (in `exportAll`, the file's zod schema or
// the merge) makes them fail.

/**
 * The only tables that are not in a backup, on purpose: the migration runner's
 * own record, this device's sync times, and the legacy history that migration
 * 0007 copied into `expense_events`. A new table belongs in the backup unless
 * it is added here, with its reason.
 */
const NOT_BACKED_UP = ['ownledger_migrations', 'sync_status', 'expense_revisions']

let sourcePg: PGlite
let targetPg: PGlite
let source: Database
let target: Database
let tables: string[]

/** The database's own tables, minus those left out of backups. */
async function backedUpTables(pg: PGlite): Promise<string[]> {
  const { rows } = await pg.query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
  )
  return rows.map((row) => row.table_name).filter((name) => !NOT_BACKED_UP.includes(name))
}

async function columnsOf(pg: PGlite, table: string): Promise<string[]> {
  const { rows } = await pg.query<{ column_name: string }>(
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = $1",
    [table],
  )
  return rows.map((row) => row.column_name).sort()
}

async function rowsOf(pg: PGlite, table: string): Promise<Record<string, unknown>[]> {
  return (await pg.query<Record<string, unknown>>(`select * from ${table} order by id`)).rows
}

const camel = (name: string) => name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
const snake = (name: string) => name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)

/** The backup's rows of a table, by its database name. */
function rowsIn(file: { rows: BackupRows }, table: string): Record<string, unknown>[] {
  return (file.rows as Record<string, Record<string, unknown>[]>)[camel(table)] ?? []
}

beforeAll(async () => {
  sourcePg = new PGlite()
  targetPg = new PGlite()
  source = await createDatabase(sourcePg)
  target = await createDatabase(targetPg)
  tables = await backedUpTables(sourcePg)
})

afterAll(async () => {
  await sourcePg.close()
  await targetPg.close()
})

beforeEach(async () => {
  await sourcePg.exec(`truncate ${tables.join(', ')} cascade`)
  await targetPg.exec(`truncate ${tables.join(', ')} cascade`)
})

const omkar = { email: 'omkar@gmail.com', name: 'Omkar' }

/**
 * Source data that fills every column of every backed-up table at least once:
 * a group with members (one who left, one without an email), expenses with
 * notes, an edit, a deletion, a version restored, a payment, photos (one
 * removed), a deleted group and a person who is in no group.
 */
async function everything() {
  const trip = await createTestGroup(source, omkar, {
    name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP', memberEmails: ['priya@gmail.com', 'dev@gmail.com'],
  })
  if (!trip.ok) throw new Error('group not created')
  const groupId = trip.groupId
  const userId = await personIdOf(source, omkar.email)
  await source.update(people).set({ name: 'Priya Shah' }).where(eq(people.email, 'priya@gmail.com'))
  // A name only this device uses (ADR-045): in the backup, never in a group's file.
  await source.update(people).set({ localName: 'Dev (flat)' }).where(eq(people.email, 'dev@gmail.com'))
  // A Google picture's address (ADR-046): in the backup and in group files.
  await source.update(people).set({ picture: 'https://lh3.googleusercontent.com/a/dev' }).where(eq(people.email, 'dev@gmail.com'))

  // A person with no email in the group, a person in no group, and a deleted person.
  const sam = await addTestPerson(source, omkar, { name: 'Sam' })
  await source.insert(groupMembers).values({ groupId, personId: sam, updatedBy: userId })
  const alone = await addTestPerson(source, omkar, { name: 'Nina', email: 'nina@gmail.com' })
  const gone = await addTestPerson(source, omkar, { name: 'Old friend' })
  await source.update(people).set({ deletedAt: new Date() }).where(eq(people.id, gone))

  // Dev left the group.
  const dev = await personIdOf(source, 'dev@gmail.com')
  await source.update(groupMembers).set({ deletedAt: new Date() })
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.personId, dev)))

  const dinner = await addTestExpense(source, omkar.email, groupId, { description: 'Dinner', notes: 'Window seat' })
  const edited = await expenseService.updateExpense(source, userId, groupId, dinner, {
    ...(await expenseInput(source, omkar.email, groupId)),
    description: 'Beach dinner',
    notes: 'Window seat',
  })
  if (!edited.ok) throw new Error('not edited')
  const [added] = await source.select().from(expenseEvents)
    .where(and(eq(expenseEvents.expenseId, dinner), eq(expenseEvents.kind, 'added')))
  const reverted = await expenseService.restoreVersion(source, userId, groupId, dinner, added.id)
  if (!reverted.ok) throw new Error('version not restored')

  const taxi = await addTestExpense(source, omkar.email, groupId, { description: 'Taxi' })
  await expenseService.deleteExpense(source, userId, groupId, taxi)
  await addTestSettlement(source, omkar.email, 'priya@gmail.com', groupId)

  // Photos are saved through the photo store in the app; here only their rows matter.
  await source.insert(expensePhotos).values([
    { expenseId: dinner, position: 0, mimeType: 'image/jpeg', sizeBytes: 1200, updatedBy: userId },
    { expenseId: dinner, position: 1, mimeType: 'image/png', sizeBytes: 900, updatedBy: userId, deletedAt: new Date() },
  ])

  // Rows the app never soft-deletes today, so that the column is still checked with a value.
  const [share] = await source.select().from(expenseShares).where(eq(expenseShares.expenseId, taxi))
  await source.update(expenseShares).set({ deletedAt: new Date() }).where(eq(expenseShares.id, share.id))
  await source.update(expenseEvents).set({ deletedAt: new Date() }).where(eq(expenseEvents.id, added.id))

  const flat = await createTestGroup(source, omkar, { name: 'Old flat', type: 'home', defaultCurrency: 'INR' })
  if (!flat.ok) throw new Error('group not created')
  await source.update(groups).set({ deletedAt: new Date() }).where(eq(groups.id, flat.groupId))

  return { groupId, userId, alone }
}

/** What a backup of the source looks like once it has been through Drive (JSON) and been read back. */
async function backupThroughDrive(userId: string) {
  const written = await backupService.exportAll(source, userId)
  const read = backupService.parse(JSON.stringify(written))
  if (!read) throw new Error('the backup was refused')
  return { written, read }
}

describe('the backup holds everything', () => {
  it('the test data fills every column of every table, so the checks below see real values', async () => {
    await everything()

    for (const table of tables) {
      const rows = await rowsOf(sourcePg, table)
      expect(rows.length, `no ${table} rows in the test data`).toBeGreaterThan(0)
      // Every column must hold a value somewhere, so the round trips check a real value of it, not only nulls.
      for (const column of await columnsOf(sourcePg, table)) {
        const filled = rows.some((row) => row[column] !== null && row[column] !== undefined)
        expect(filled, `${table}.${column} is empty in every row: add data for it to everything()`).toBe(true)
      }
    }
  })

  it('has every table of the database, apart from those left out on purpose', async () => {
    const { userId } = await everything()

    const { written } = await backupThroughDrive(userId)

    expect(Object.keys(written.rows).map(snake).sort()).toEqual(tables)
  })

  it('keeps every column of every row when it is written and read back', async () => {
    const { userId } = await everything()

    const { written, read } = await backupThroughDrive(userId)

    expect(read.rows).toEqual(written.rows)
    for (const table of tables) {
      const columns = (await columnsOf(sourcePg, table)).map(camel).sort()
      for (const row of rowsIn(read, table)) expect(Object.keys(row).sort(), table).toEqual(columns)
    }
  })

  it('holds every row of the device, people in no group and deleted rows included', async () => {
    const { userId, alone } = await everything()

    const { read } = await backupThroughDrive(userId)

    for (const table of tables) {
      const ids = (await rowsOf(sourcePg, table)).map((row) => row.id).sort()
      expect(rowsIn(read, table).map((row) => row.id).sort(), table).toEqual(ids)
    }
    expect(read.rows.people.find((person) => person.id === alone)).toMatchObject({ name: 'Nina', email: 'nina@gmail.com' })
  })

  it('brings back every row exactly as it was on an empty device', async () => {
    const { userId } = await everything()
    const { read } = await backupThroughDrive(userId)

    await backupService.importAll(target, read)

    for (const table of tables) expect(await rowsOf(targetPg, table), table).toEqual(await rowsOf(sourcePg, table))
  })
})

describe('a member\'s group file holds the whole group', () => {
  it('has rows of every table, keeps every column and brings them back exactly', async () => {
    const { groupId, userId } = await everything()
    const written = await backupService.exportGroup(source, groupId, userId)

    const read = backupService.parseGroupFile(JSON.stringify(written), groupId)
    if (!read) throw new Error('the group file was refused')
    await backupService.importGroup(target, read)

    expect(Object.keys(read.rows).map(snake).sort()).toEqual(tables)
    expect(read.rows).toEqual(written.rows)
    for (const table of tables) {
      const inFile = rowsIn(read, table)
      expect(inFile.length, `no ${table} rows in the group file`).toBeGreaterThan(0)
      const sourceRows = new Map((await rowsOf(sourcePg, table)).map((row) => [row.id, row]))
      const targetRows = await rowsOf(targetPg, table)
      expect(targetRows.map((row) => row.id).sort(), table).toEqual(inFile.map((row) => row.id).sort())
      for (const row of targetRows) {
        // A local name is private to a device (ADR-045): a group file never carries it.
        const expected = table === 'people' ? { ...sourceRows.get(row.id), local_name: null } : sourceRows.get(row.id)
        expect(row, table).toEqual(expected)
      }
    }
    expect(JSON.stringify(written)).not.toContain('Dev (flat)')
  })
})
