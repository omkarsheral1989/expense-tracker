import { PGlite } from '@electric-sql/pglite'
import { eq, isNull } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase, type Database } from '../client.ts'
import {
  EXPENSE_DESCRIPTION_MAX_LENGTH,
  EXPENSE_NOTES_MAX_LENGTH,
  GROUP_NAME_MAX_LENGTH,
} from '../constants.ts'
import { runMigrations } from '../migrate.ts'
import { expenseRevisions, expenseShares, expenses, groupMembers, groups, people } from '../schema.ts'

let pg: PGlite
let db: Database

beforeAll(async () => {
  pg = new PGlite()
  db = await createDatabase(pg)
})

afterAll(() => pg.close())

beforeEach(() => pg.exec('truncate expense_revisions, expense_photos, expense_shares, expenses, group_members, groups, people cascade'))

/** A person who made their own row, the way the signed-in user does. */
async function addPerson(email: string) {
  const id = crypto.randomUUID()
  await db.insert(people).values({ id, email, updatedBy: id })
  return id
}

async function addGroup(createdBy: string, overrides = {}) {
  const [group] = await db
    .insert(groups)
    .values({
      name: 'Goa trip',
      type: 'trip',
      defaultCurrency: 'INR',
      createdBy,
      updatedBy: createdBy,
      ...overrides,
    })
    .returning()
  return group
}

describe('migrations', () => {
  it('can run again without changing anything', async () => {
    await runMigrations(pg)
    const { rows } = await pg.query('select name from ownledger_migrations')
    expect(rows).toHaveLength(7)
  })

  it('does not record a file that fails, and applies nothing from it', async () => {
    await expect(
      runMigrations(pg, { './migrations/0099_broken.sql': 'create table half (id int); select nope;' }),
    ).rejects.toThrow()

    const { rows } = await pg.query(
      "select 1 from information_schema.tables where table_name = 'half'",
    )
    expect(rows).toHaveLength(0)
  })
})

describe('upgrading a database that already has the first migration', () => {
  const all = import.meta.glob('../migrations/*.sql', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>

  it('applies only the newer migration and keeps the existing data', async () => {
    const old = new PGlite()
    const [first, ...rest] = Object.keys(all).sort()
    await runMigrations(old, { [first]: all[first] })

    const person = crypto.randomUUID()
    await old.query(
      'insert into people (id, email, updated_by) values ($1, $2, $1)',
      [person, 'omkar@gmail.com'],
    )

    await runMigrations(old, all)

    const { rows } = await old.query<{ name: string }>(
      'select name from ownledger_migrations order by name',
    )
    expect(rows).toHaveLength(rest.length + 1)
    const people = await old.query('select email from people')
    expect(people.rows).toEqual([{ email: 'omkar@gmail.com' }])
    // The new column exists and enforces its format.
    await expect(
      old.query(
        "insert into groups (name, type, default_currency, created_by, updated_by) values ('G', 'trip', 'inr', $1, $1)",
        [person],
      ),
    ).rejects.toThrow()
    await old.close()
  })
})

describe('migration 0006, which adds when an expense was created', () => {
  const all = import.meta.glob('../migrations/*.sql', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>

  it('gives an expense never edited its last change, and an edited one its first edit', async () => {
    const old = new PGlite()
    const names = Object.keys(all).sort()
    const last = names.find((name) => name.endsWith('0006_expense_created_at.sql')) as string
    // A database as it was before this migration.
    await runMigrations(old, Object.fromEntries(names.filter((name) => name !== last).map((name) => [name, all[name]])))

    const person = crypto.randomUUID()
    const group = crypto.randomUUID()
    await old.query('insert into people (id, email, updated_by) values ($1, $2, $1)', [person, 'omkar@gmail.com'])
    await old.query(
      "insert into groups (id, name, type, default_currency, created_by, updated_by) values ($1, 'G', 'trip', 'INR', $2, $2)",
      [group, person],
    )
    const addExpense = async (updatedAt: string) => {
      const id = crypto.randomUUID()
      await old.query(
        `insert into expenses (id, group_id, description, category, amount_minor, currency, date, method, created_by, updated_by, updated_at)
         values ($1, $2, 'Dinner', 'general', 1000, 'INR', '2026-10-08', 'equal', $3, $3, $4)`,
        [id, group, person, updatedAt],
      )
      return id
    }
    const neverEdited = await addExpense('2026-10-10T10:00:00Z')
    const edited = await addExpense('2026-10-14T09:00:00Z')
    for (const editedAt of ['2026-10-12T08:30:00Z', '2026-10-14T09:00:00Z']) {
      await old.query(
        `insert into expense_revisions (expense_id, edited_by, edited_at, before, changes, updated_by, updated_at)
         values ($1, $2, $3, '{}', '[]', $2, $3)`,
        [edited, person, editedAt],
      )
    }

    await runMigrations(old, all)

    const { rows } = await old.query<{ id: string; created_at: Date }>('select id, created_at from expenses')
    const createdAt = Object.fromEntries(rows.map((row) => [row.id, row.created_at.toISOString()]))
    expect(createdAt[neverEdited]).toBe('2026-10-10T10:00:00.000Z')
    expect(createdAt[edited]).toBe('2026-10-12T08:30:00.000Z')
    await old.close()
  })
})

describe('people', () => {
  it('lets a person be their own updated_by and fills in the defaults', async () => {
    const id = await addPerson('omkar@gmail.com')
    const [person] = await db.select().from(people).where(eq(people.id, id))
    expect(person.updatedAt).toBeInstanceOf(Date)
    expect(person.deletedAt).toBeNull()
    expect(person.name).toBeNull()
  })

  it('rejects an email that is not lower-case', async () => {
    await expect(addPerson('Omkar@Gmail.com')).rejects.toThrow()
  })

  it('rejects the same email twice', async () => {
    await addPerson('omkar@gmail.com')
    await expect(addPerson('omkar@gmail.com')).rejects.toThrow()
  })

  it('lets a person have no email, and any number of them', async () => {
    const owner = await addPerson('omkar@gmail.com')
    for (const name of ['Rahul', 'Suprabha']) {
      await db.insert(people).values({ name, email: null, updatedBy: owner })
    }

    const withoutEmail = await db.select({ name: people.name }).from(people).where(isNull(people.email))
    expect(withoutEmail.map((person) => person.name).sort()).toEqual(['Rahul', 'Suprabha'])
  })
})

describe('groups', () => {
  it('stores a group with a valid name and type', async () => {
    const owner = await addPerson('omkar@gmail.com')
    const group = await addGroup(owner)
    expect(group.name).toBe('Goa trip')
    expect(group.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('rejects an empty name and a name that is too long', async () => {
    const owner = await addPerson('omkar@gmail.com')
    await expect(addGroup(owner, { name: '' })).rejects.toThrow()
    await expect(
      addGroup(owner, { name: 'x'.repeat(GROUP_NAME_MAX_LENGTH + 1) }),
    ).rejects.toThrow()
    await expect(
      addGroup(owner, { name: 'x'.repeat(GROUP_NAME_MAX_LENGTH) }),
    ).resolves.toBeDefined()
  })

  it('rejects an unknown type', async () => {
    const owner = await addPerson('omkar@gmail.com')
    await expect(addGroup(owner, { type: 'boat' })).rejects.toThrow()
  })

  it('rejects a default currency that is not three upper-case letters', async () => {
    const owner = await addPerson('omkar@gmail.com')
    for (const defaultCurrency of ['inr', 'IN', 'INRR', 'I1R', '']) {
      await expect(addGroup(owner, { defaultCurrency })).rejects.toThrow()
    }
    await expect(addGroup(owner, { defaultCurrency: 'USD' })).resolves.toBeDefined()
  })

  it('rejects a creator who is not a known person', async () => {
    await expect(addGroup(crypto.randomUUID())).rejects.toThrow()
  })
})

describe('group members', () => {
  it('links people to a group, once each', async () => {
    const owner = await addPerson('omkar@gmail.com')
    const friend = await addPerson('friend@gmail.com')
    const group = await addGroup(owner)

    await db.insert(groupMembers).values([
      { groupId: group.id, personId: owner, updatedBy: owner },
      { groupId: group.id, personId: friend, updatedBy: owner },
    ])
    await expect(
      db.insert(groupMembers).values({ groupId: group.id, personId: friend, updatedBy: owner }),
    ).rejects.toThrow()

    const members = await db
      .select({ email: people.email })
      .from(groupMembers)
      .innerJoin(people, eq(people.id, groupMembers.personId))
      .where(eq(groupMembers.groupId, group.id))
      .orderBy(people.email)
    expect(members.map((member) => member.email)).toEqual([
      'friend@gmail.com',
      'omkar@gmail.com',
    ])
  })

  it('rejects a member who is not a known person', async () => {
    const owner = await addPerson('omkar@gmail.com')
    const group = await addGroup(owner)
    await expect(
      db.insert(groupMembers).values({
        groupId: group.id,
        personId: crypto.randomUUID(),
        updatedBy: owner,
      }),
    ).rejects.toThrow()
  })
})

describe('expenses', () => {
  async function addExpense(overrides = {}) {
    const owner = await addPerson('omkar@gmail.com')
    const group = await addGroup(owner)
    const [expense] = await db
      .insert(expenses)
      .values({
        groupId: group.id,
        description: 'Dinner',
        category: 'food.dining_out',
        amountMinor: 123456,
        currency: 'INR',
        date: '2026-10-08',
        method: 'equal',
        createdBy: owner,
        updatedBy: owner,
        ...overrides,
      })
      .returning()
    return { owner, expense }
  }

  it('stores an expense with its amount in minor units and its day', async () => {
    const { expense } = await addExpense()
    expect(expense).toMatchObject({ amountMinor: 123456, date: '2026-10-08', notes: null })
  })

  it('keeps amounts above the 32-bit range exactly', async () => {
    // One billion rupees in paise.
    const { expense } = await addExpense({ amountMinor: 100_000_000_000 })
    expect(expense.amountMinor).toBe(100_000_000_000)
  })

  it.each([
    ['an empty description', { description: '' }],
    ['a description that is too long', { description: 'a'.repeat(EXPENSE_DESCRIPTION_MAX_LENGTH + 1) }],
    ['notes that are too long', { notes: 'a'.repeat(EXPENSE_NOTES_MAX_LENGTH + 1) }],
    ['a zero amount', { amountMinor: 0 }],
    ['a negative amount', { amountMinor: -5 }],
    ['a lower-case currency', { currency: 'inr' }],
    ['an unknown split method', { method: 'random' }],
  ])('rejects %s', async (_, overrides) => {
    await expect(addExpense(overrides)).rejects.toThrow()
  })

  it('accepts the longest description and notes', async () => {
    await expect(
      addExpense({
        description: 'a'.repeat(EXPENSE_DESCRIPTION_MAX_LENGTH),
        notes: 'a'.repeat(EXPENSE_NOTES_MAX_LENGTH),
      }),
    ).resolves.toBeDefined()
  })

  it('keeps one share per person per expense, with no negative amounts', async () => {
    const { owner, expense } = await addExpense()
    const share = { expenseId: expense.id, personId: owner, updatedBy: owner }

    await db.insert(expenseShares).values({ ...share, paidMinor: 123456, owedMinor: 123456, inputValue: 1 })
    await expect(db.insert(expenseShares).values(share)).rejects.toThrow()

    const friend = await addPerson('friend@gmail.com')
    await expect(
      db.insert(expenseShares).values({ ...share, personId: friend, owedMinor: -1 }),
    ).rejects.toThrow()
    await expect(
      db.insert(expenseShares).values({ ...share, personId: friend, paidMinor: -1 }),
    ).rejects.toThrow()

    const [stored] = await db.select().from(expenseShares).where(eq(expenseShares.personId, owner))
    expect(stored).toMatchObject({ paidMinor: 123456, owedMinor: 123456, inputValue: 1 })
  })
  it('stores a revision with the expense as it was and what changed, as JSON, for a real expense and editor', async () => {
    const { owner, expense } = await addExpense()
    const before = {
      description: 'Dinner',
      category: 'food.dining_out',
      amountMinor: 123456,
      currency: 'INR',
      date: '2026-10-08',
      notes: null,
      method: 'equal' as const,
      shares: [{ personId: owner, paidMinor: 123456, owedMinor: 123456, inputValue: 1 }],
      photos: [],
    }
    const changes = [{ field: 'description' as const, from: 'Dinner', to: 'Lunch' }]
    const editedAt = new Date('2026-10-20T12:15:00Z')

    await db
      .insert(expenseRevisions)
      .values({ expenseId: expense.id, editedBy: owner, editedAt, before, changes, updatedBy: owner, updatedAt: editedAt })

    const [stored] = await db.select().from(expenseRevisions).where(eq(expenseRevisions.expenseId, expense.id))
    expect(stored).toMatchObject({ editedBy: owner, before, changes, deletedAt: null })
    expect(stored.editedAt).toEqual(editedAt)
    await expect(
      db.insert(expenseRevisions).values({
        expenseId: crypto.randomUUID(),
        editedBy: owner,
        editedAt,
        before,
        changes,
        updatedBy: owner,
      }),
    ).rejects.toThrow()
  })
})
