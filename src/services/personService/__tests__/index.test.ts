import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase, type Database } from '../../../db/client.ts'
import { people } from '../../../db/schema.ts'
import { addTestPerson, ensurePersonId, type TestUser } from '../../../testing/groups.ts'
import { personService } from '../index.ts'

let pg: PGlite
let db: Database

beforeAll(async () => {
  pg = new PGlite()
  db = await createDatabase(pg)
})

afterAll(() => pg.close())

beforeEach(async () => {
  await pg.exec('truncate expense_photos, expense_shares, expenses, group_members, groups, people cascade')
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
