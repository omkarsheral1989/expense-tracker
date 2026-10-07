import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase, type Database } from '../client.ts'
import { GROUP_NAME_MAX_LENGTH } from '../constants.ts'
import { runMigrations } from '../migrate.ts'
import { groupMembers, groups, people } from '../schema.ts'

let pg: PGlite
let db: Database

beforeAll(async () => {
  pg = new PGlite()
  db = await createDatabase(pg)
})

afterAll(() => pg.close())

beforeEach(() => pg.exec('truncate group_members, groups, people cascade'))

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
    expect(rows).toHaveLength(2)
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
