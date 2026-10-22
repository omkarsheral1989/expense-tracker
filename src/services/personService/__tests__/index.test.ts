import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase, type Database } from '../../../db/client.ts'
import { people, syncStatus } from '../../../db/schema.ts'
import { addTestExpense } from '../../../testing/expenses.ts'
import { addTestPerson, createTestGroup, ensurePersonId, type TestUser } from '../../../testing/groups.ts'
import { expenseService } from '../../expenseService'
import { groupService } from '../../groupService'
import { personService } from '../index.ts'

let pg: PGlite
let db: Database

beforeAll(async () => {
  pg = new PGlite()
  db = await createDatabase(pg)
})

afterAll(() => pg.close())

beforeEach(async () => {
  await pg.exec('truncate sync_status, expense_events, expense_photos, expense_shares, expenses, group_members, groups, people cascade')
  adderId = await ensurePersonId(db, omkar.email, omkar.name)
})

const omkar: TestUser = { email: 'omkar@gmail.com', name: 'Omkar Sheral' }

/** The person who adds people in these tests: the user. */
let adderId: string

/** Adds a person and returns the saved person, failing the test if it was refused. */
async function add(input: { name: string; email?: string }) {
  const result = await personService.addPerson(db, adderId, input)
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.errors)}`)
  return result.person
}

describe('personService.addPerson', () => {
  it('saves a person with just a name, and returns them', async () => {
    const person = await add({ name: 'Rahul' })

    expect(person).toEqual({ id: expect.any(String), name: 'Rahul', email: null })
    const [row] = await db.select().from(people).where(eq(people.id, person.id))
    expect(row).toMatchObject({ name: 'Rahul', email: null, deletedAt: null })
  })

  it('saves a person with a Gmail address', async () => {
    const person = await add({ name: 'Priya Shah', email: 'priya@gmail.com' })
    expect(person).toMatchObject({ name: 'Priya Shah', email: 'priya@gmail.com' })
  })

  it('cleans up the input: the name is trimmed with its spaces collapsed, the email is lower-cased', async () => {
    const person = await add({ name: '  Priya    Shah ', email: '  Priya.Shah@GMAIL.com ' })
    expect(person).toMatchObject({ name: 'Priya Shah', email: 'priya.shah@gmail.com' })
  })

  it('treats an empty or blank email as none', async () => {
    expect((await add({ name: 'A', email: '' })).email).toBeNull()
    expect((await add({ name: 'B', email: '   ' })).email).toBeNull()
  })

  it('lets any number of people have no email', async () => {
    await add({ name: 'Rahul' })
    await add({ name: 'Suprabha' })
    expect(await db.select().from(people).where(eq(people.email, 'nobody@gmail.com'))).toEqual([])
    expect((await db.select().from(people)).filter((person) => person.email === null)).toHaveLength(2)
  })

  it('records who added them', async () => {
    const person = await add({ name: 'Rahul' })

    const [row] = await db.select().from(people).where(eq(people.id, person.id))
    expect(row.updatedBy).toBe(adderId)
    expect(await db.select().from(people)).toHaveLength(2)
  })

  describe('refusing bad input', () => {
    it('asks for a name', async () => {
      for (const name of ['', '   ']) {
        expect(await personService.addPerson(db, adderId, { name })).toEqual({
          ok: false,
          errors: { name: 'Enter a name.' },
        })
      }
      expect(await personService.addPerson(db, adderId, {} as never)).toEqual({
        ok: false,
        errors: { name: 'Enter a name.' },
      })
    })

    it('refuses a name over 60 characters but accepts exactly 60', async () => {
      const tooLong = await personService.addPerson(db, adderId, { name: 'x'.repeat(61) })
      expect(tooLong).toEqual({ ok: false, errors: { name: 'Use at most 60 characters.' } })

      await expect(add({ name: 'y'.repeat(60) })).resolves.toBeDefined()
    })

    it('refuses an email that is not a Gmail address', async () => {
      for (const email of ['bob@yahoo.com', 'notanemail', 'b@gmail.com.evil.com', 'a b@gmail.com']) {
        expect(await personService.addPerson(db, adderId, { name: 'Bob', email })).toEqual({
          ok: false,
          errors: { email: 'Only @gmail.com addresses can be added.' },
        })
      }
    })

    it('reports a bad name and a bad email together', async () => {
      expect(await personService.addPerson(db, adderId, { name: ' ', email: 'bob@yahoo.com' })).toEqual({
        ok: false,
        errors: { name: 'Enter a name.', email: 'Only @gmail.com addresses can be added.' },
      })
    })

    it('saves nobody when the input itself is refused', async () => {
      await personService.addPerson(db, adderId, { name: '' })
      expect(await db.select().from(people)).toHaveLength(1) // only the adder
    })
  })

  describe('a person who is already there', () => {
    it('refuses an email someone has, in any case, naming them (or their email when they have no name)', async () => {
      await addTestPerson(db, omkar, { name: 'Priya Shah', email: 'priya@gmail.com' })
      await addTestPerson(db, omkar, { name: 'Sam', email: 'sam@gmail.com' })
      await db.update(people).set({ name: null }).where(eq(people.email, 'sam@gmail.com'))

      expect(await personService.addPerson(db, adderId, { name: 'Another', email: 'PRIYA@gmail.com' })).toEqual({
        ok: false,
        errors: { email: 'Priya Shah is already in your list with this email.' },
      })
      expect(await personService.addPerson(db, adderId, { name: 'Another', email: 'sam@gmail.com' })).toEqual({
        ok: false,
        errors: { email: 'sam@gmail.com is already in your list with this email.' },
      })
    })

    it('refuses the adder\'s own address, since they are added automatically', async () => {
      await add({ name: 'Someone' })

      expect(await personService.addPerson(db, adderId, { name: 'Me again', email: 'Omkar@Gmail.com' })).toEqual({
        ok: false,
        errors: { email: 'That is your own address. You are added automatically.' },
      })
    })

    it('refuses a name someone has, ignoring case and extra spaces, naming them as saved', async () => {
      await add({ name: 'Sam Lee' })

      for (const name of ['Sam Lee', 'sam lee', '  SAM    lee ']) {
        expect(await personService.addPerson(db, adderId, { name })).toEqual({
          ok: false,
          errors: { name: 'You already have someone called Sam Lee.' },
        })
      }
    })

    it('counts the adder, and people with an email, when comparing names', async () => {
      await add({ name: 'Priya', email: 'priya@gmail.com' })

      expect(await personService.addPerson(db, adderId, { name: 'priya' })).toMatchObject({ ok: false })
      expect(await personService.addPerson(db, adderId, { name: 'omkar sheral' })).toMatchObject({ ok: false })
    })

    it('does not count a deleted person, and does not mind people without a name', async () => {
      const sam = await add({ name: 'Sam' })
      await db.update(people).set({ deletedAt: new Date() }).where(eq(people.id, sam.id))
      await addTestPerson(db, omkar, { name: 'Ann', email: 'ann@gmail.com' })
      await db.update(people).set({ name: null }).where(eq(people.email, 'ann@gmail.com'))

      await expect(add({ name: 'Sam' })).resolves.toBeDefined()
    })

    it('reports a repeated name and a repeated email together, and saves nobody', async () => {
      await add({ name: 'Sam', email: 'sam@gmail.com' })
      const before = await db.select().from(people)

      expect(await personService.addPerson(db, adderId, { name: 'sam', email: 'sam@gmail.com' })).toEqual({
        ok: false,
        errors: {
          name: 'You already have someone called Sam.',
          email: 'Sam is already in your list with this email.',
        },
      })
      expect(await db.select().from(people)).toHaveLength(before.length)
    })
  })
})

describe('personService.listManaged', () => {
  it('lists everyone but the user, by the name shown (the local name, else the shared name, else the email)', async () => {
    const sam = await addTestPerson(db, omkar, { name: 'Sam' })
    await addTestPerson(db, omkar, { name: 'Zoe' })
    await addTestPerson(db, omkar, { name: 'Alan', email: 'alan@gmail.com' })
    await db.update(people).set({ name: null }).where(eq(people.email, 'alan@gmail.com'))
    await db.update(people).set({ localName: 'Aaron' }).where(eq(people.id, sam))

    const list = await personService.listManaged(db, adderId)

    expect(list.map((person) => person.localName ?? person.sharedName ?? person.email)).toEqual([
      'Aaron',
      'alan@gmail.com',
      'Zoe',
    ])
    expect(list.find((person) => person.id === sam)).toMatchObject({ sharedName: 'Sam', localName: 'Aaron' })
    expect(list.some((person) => person.id === adderId)).toBe(false)
  })

  it('leaves out deleted people', async () => {
    const gone = await addTestPerson(db, omkar, { name: 'Old friend' })
    await db.update(people).set({ deletedAt: new Date() }).where(eq(people.id, gone))
    expect(await personService.listManaged(db, adderId)).toEqual([])
  })

  it('says who is pending: nobody whose own file this device has read in any group', async () => {
    const priya = await addTestPerson(db, omkar, { name: 'Priya', email: 'priya@gmail.com' })
    const sam = await addTestPerson(db, omkar, { name: 'Sam' })
    await db.insert(syncStatus).values({ scope: `member:some-group:${priya}`, lastSyncedAt: new Date() })

    const list = await personService.listManaged(db, adderId)

    expect(list.find((person) => person.id === priya)?.pending).toBe(false)
    expect(list.find((person) => person.id === sam)?.pending).toBe(true)
  })

  it('carries the picture address', async () => {
    const priya = await addTestPerson(db, omkar, { name: 'Priya' })
    await db.update(people).set({ picture: 'https://example.com/p.png' }).where(eq(people.id, priya))
    expect((await personService.listManaged(db, adderId))[0].picture).toBe('https://example.com/p.png')
  })
})

describe('personService.updatePerson', () => {
  const update = (personId: string, input: { localName: string; email?: string }) =>
    personService.updatePerson(db, adderId, personId, input)
  const rowOf = async (id: string) => (await db.select().from(people).where(eq(people.id, id)))[0]

  it('gives a person a name this device uses, and leaves their shared name and row time alone', async () => {
    const sam = await addTestPerson(db, omkar, { name: 'Sam' })
    const before = await rowOf(sam)

    expect(await update(sam, { localName: '  Sam   Cousin ' })).toEqual({ ok: true })

    expect(await rowOf(sam)).toMatchObject({
      name: 'Sam',
      localName: 'Sam Cousin',
      updatedAt: before.updatedAt,
      updatedBy: before.updatedBy,
    })
  })

  it('requires a name', async () => {
    const sam = await addTestPerson(db, omkar, { name: 'Sam' })
    for (const localName of ['', '   ']) {
      expect(await update(sam, { localName })).toEqual({ ok: false, errors: { localName: 'Enter a name.' } })
    }
    expect(await update(sam, {} as never)).toEqual({ ok: false, errors: { localName: 'Enter a name.' } })
    expect((await rowOf(sam)).localName).toBeNull()
  })

  it('refuses a name over 60 characters', async () => {
    const sam = await addTestPerson(db, omkar, { name: 'Sam' })
    expect(await update(sam, { localName: 'x'.repeat(61) })).toEqual({
      ok: false,
      errors: { localName: 'Use at most 60 characters.' },
    })
  })

  it('stores no local name when the name is the shared one (ignoring case and spaces), clearing an earlier one', async () => {
    const sam = await addTestPerson(db, omkar, { name: 'Sam Roy' })
    await update(sam, { localName: 'Cousin Sam' })
    expect((await rowOf(sam)).localName).toBe('Cousin Sam')

    expect(await update(sam, { localName: ' sam  ROY ' })).toEqual({ ok: true })

    expect((await rowOf(sam)).localName).toBeNull()
  })

  it('refuses a name shown for someone else, naming them, but not the same person\'s own name', async () => {
    const sam = await addTestPerson(db, omkar, { name: 'Sam' })
    const zoe = await addTestPerson(db, omkar, { name: 'Zoe' })
    await db.update(people).set({ localName: 'Boss' }).where(eq(people.id, zoe))

    // Zoe is shown as Boss, so her shared name is free for someone else.
    expect(await update(sam, { localName: 'zoe' })).toEqual({ ok: true })
    expect(await update(sam, { localName: 'boss' })).toEqual({
      ok: false,
      errors: { localName: 'You already have someone called Boss.' },
    })
    expect(await update(sam, { localName: 'Omkar Sheral' })).toEqual({
      ok: false,
      errors: { localName: 'You already have someone called Omkar Sheral.' },
    })
    expect(await update(zoe, { localName: 'BOSS' })).toEqual({ ok: true })
  })

  it('refuses a person who is not there, who was deleted, or the user themself', async () => {
    const gone = await addTestPerson(db, omkar, { name: 'Old friend' })
    await db.update(people).set({ deletedAt: new Date() }).where(eq(people.id, gone))

    for (const id of [crypto.randomUUID(), gone, adderId]) {
      expect(await update(id, { localName: 'Anyone' })).toEqual({ ok: false, notFound: true })
    }
  })

  describe('the email', () => {
    it('sets it on a pending person, shared with the group: their row is newer and changed by the user', async () => {
      const sam = await addTestPerson(db, omkar, { name: 'Sam' })
      const before = await rowOf(sam)

      expect(await update(sam, { localName: 'Sam', email: '  Sam@Gmail.com ' })).toEqual({ ok: true })

      const row = await rowOf(sam)
      expect(row.email).toBe('sam@gmail.com')
      expect(row.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime())
      expect(row.updatedBy).toBe(adderId)
    })

    it('changes a mistyped email on a pending person', async () => {
      const sam = await addTestPerson(db, omkar, { name: 'Sam', email: 'smm@gmail.com' })
      expect(await update(sam, { localName: 'Sam', email: 'sam@gmail.com' })).toEqual({ ok: true })
      expect((await rowOf(sam)).email).toBe('sam@gmail.com')
    })

    it('leaves it as it is when empty', async () => {
      const sam = await addTestPerson(db, omkar, { name: 'Sam', email: 'sam@gmail.com' })
      expect(await update(sam, { localName: 'Sammy', email: '' })).toEqual({ ok: true })
      expect((await rowOf(sam)).email).toBe('sam@gmail.com')
    })

    it('refuses a person who has already signed in and synced', async () => {
      const priya = await addTestPerson(db, omkar, { name: 'Priya', email: 'priya@gmail.com' })
      await db.insert(syncStatus).values({ scope: `member:some-group:${priya}`, lastSyncedAt: new Date() })

      expect(await update(priya, { localName: 'Priya', email: 'other@gmail.com' })).toEqual({
        ok: false,
        errors: { email: 'This person has already signed in, so their email cannot be changed.' },
      })
      expect((await rowOf(priya)).email).toBe('priya@gmail.com')
    })

    it('refuses an email someone else has, naming them, and changes nothing else either', async () => {
      await addTestPerson(db, omkar, { name: 'Samuel Roy', email: 'sam@gmail.com' })
      const sam = await addTestPerson(db, omkar, { name: 'Sam' })

      expect(await update(sam, { localName: 'Sammy', email: 'SAM@gmail.com' })).toEqual({
        ok: false,
        errors: { email: 'Samuel Roy is already in your list with this email.' },
      })
      expect(await rowOf(sam)).toMatchObject({ email: null, localName: null })
    })

    it('refuses the user\'s own address and an address that is not a Gmail one', async () => {
      const sam = await addTestPerson(db, omkar, { name: 'Sam' })
      expect(await update(sam, { localName: 'Sam', email: 'omkar@gmail.com' })).toEqual({
        ok: false,
        errors: { email: 'That is your own address.' },
      })
      expect(await update(sam, { localName: 'Sam', email: 'sam@yahoo.com' })).toEqual({
        ok: false,
        errors: { email: 'Only @gmail.com addresses can be added.' },
      })
    })

    it('reports a bad name and a bad email together', async () => {
      const sam = await addTestPerson(db, omkar, { name: 'Sam' })
      expect(await update(sam, { localName: ' ', email: 'sam@yahoo.com' })).toEqual({
        ok: false,
        errors: { localName: 'Enter a name.', email: 'Only @gmail.com addresses can be added.' },
      })
    })
  })
})

describe('the name this device uses for a person', () => {
  it('is refused for a new member too: Add a new member checks the names shown', async () => {
    const sam = await addTestPerson(db, omkar, { name: 'Sam' })
    await personService.updatePerson(db, adderId, sam, { localName: 'Cousin' })

    expect(await personService.addPerson(db, adderId, { name: 'cousin' })).toEqual({
      ok: false,
      errors: { name: 'You already have someone called Cousin.' },
    })
  })

  it('is the name every screen shows: the known people, the group\'s members and an expense\'s split', async () => {
    const group = await createTestGroup(db, omkar, {
      name: 'Goa', type: 'trip', defaultCurrency: 'GBP', memberEmails: ['priya@gmail.com'],
    })
    if (!group.ok) throw new Error('group refused')
    const priya = await ensurePersonId(db, 'priya@gmail.com', null)
    await db.update(people).set({ name: 'Priya Shah', localName: 'Sis' }).where(eq(people.id, priya))
    const expenseId = await addTestExpense(db, 'omkar@gmail.com', group.groupId)

    const known = await groupService.listKnownPeople(db, adderId)
    const details = await groupService.getGroup(db, adderId, group.groupId)
    const expense = await expenseService.getExpense(db, adderId, group.groupId, expenseId)

    expect(known.find((person) => person.id === priya)?.name).toBe('Sis')
    expect(details?.members.find((member) => member.personId === priya)?.name).toBe('Sis')
    expect(expense?.shares.find((share) => share.personId === priya)?.name).toBe('Sis')
  })

  it('also names who deleted an expense and who edited it', async () => {
    const group = await createTestGroup(db, omkar, {
      name: 'Goa', type: 'trip', defaultCurrency: 'GBP', memberEmails: ['priya@gmail.com'],
    })
    if (!group.ok) throw new Error('group refused')
    const priya = await ensurePersonId(db, 'priya@gmail.com', null)
    await db.update(people).set({ localName: 'Sis' }).where(eq(people.id, priya))
    const expenseId = await addTestExpense(db, 'omkar@gmail.com', group.groupId)
    await expenseService.deleteExpense(db, priya, group.groupId, expenseId)

    const [item] = await expenseService.listExpenses(db, adderId, group.groupId)

    expect(item.deleted?.by.name).toBe('Sis')
  })
})
