import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase, type Database } from '../../../db/client.ts'
import { groupMembers, groups, people } from '../../../db/schema.ts'
import { groupService } from '../index.ts'
import type { CreateGroupInput, Creator } from '../types.ts'

let pg: PGlite
let db: Database

beforeAll(async () => {
  pg = new PGlite()
  db = await createDatabase(pg)
})

afterAll(() => pg.close())

beforeEach(() => pg.exec('truncate group_members, groups, people cascade'))

const omkar: Creator = { email: 'omkar@gmail.com', name: 'Omkar' }
const priya: Creator = { email: 'priya@gmail.com', name: 'Priya' }

const validInput: CreateGroupInput = {
  name: 'Goa trip',
  type: 'trip',
  defaultCurrency: 'INR',
  memberEmails: [],
}

/** Creates a group and returns its id, failing the test if it was refused. */
async function create(creator: Creator, input: Partial<CreateGroupInput> = {}) {
  const result = await groupService.createGroup(db, creator, { ...validInput, ...input })
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.errors)}`)
  return result.groupId
}

async function memberEmails(groupId: string) {
  const rows = await db
    .select({ email: people.email })
    .from(groupMembers)
    .innerJoin(people, eq(people.id, groupMembers.personId))
    .where(eq(groupMembers.groupId, groupId))
  return rows.map((row) => row.email).sort()
}

describe('createGroup', () => {
  it('saves the group, adds the creator, and adds each member as a person', async () => {
    const groupId = await create(omkar, {
      memberEmails: ['priya@gmail.com', 'sam@gmail.com'],
    })

    const [group] = await db.select().from(groups).where(eq(groups.id, groupId))
    expect(group).toMatchObject({ name: 'Goa trip', type: 'trip', defaultCurrency: 'INR' })
    expect(await memberEmails(groupId)).toEqual([
      'omkar@gmail.com',
      'priya@gmail.com',
      'sam@gmail.com',
    ])

    // Added by the creator, who is their own `updated_by`.
    const rows = await db.select().from(people)
    const creator = rows.find((person) => person.email === 'omkar@gmail.com')!
    expect(creator.updatedBy).toBe(creator.id)
    expect(creator.name).toBe('Omkar')
    expect(group.createdBy).toBe(creator.id)
    const added = rows.find((person) => person.email === 'priya@gmail.com')!
    expect(added.updatedBy).toBe(creator.id)
    expect(added.name).toBeNull()
  })

  it('works with no other members', async () => {
    const groupId = await create(omkar)
    expect(await memberEmails(groupId)).toEqual(['omkar@gmail.com'])
  })

  it('trims the name and cleans up the member emails', async () => {
    const groupId = await create(omkar, {
      name: '  Goa trip  ',
      memberEmails: [' Priya@Gmail.com ', 'priya@gmail.com', 'PRIYA@GMAIL.COM', 'OMKAR@gmail.com'],
    })

    const [group] = await db.select().from(groups).where(eq(groups.id, groupId))
    expect(group.name).toBe('Goa trip')
    // Repeats are ignored, and so is the creator's own address.
    expect(await memberEmails(groupId)).toEqual(['omkar@gmail.com', 'priya@gmail.com'])
  })

  it('reuses a person who already exists instead of adding them again', async () => {
    await create(omkar, { name: 'Goa', memberEmails: ['priya@gmail.com'] })
    await create(omkar, { name: 'Flat', type: 'home', memberEmails: ['priya@gmail.com'] })
    await create(priya, { name: 'Dinner', type: 'other' })

    const rows = await db.select().from(people)
    expect(rows.map((person) => person.email).sort()).toEqual([
      'omkar@gmail.com',
      'priya@gmail.com',
    ])
  })

  it('updates the creator\'s name when it has changed', async () => {
    await create(omkar, { name: 'One' })
    await create({ ...omkar, name: 'Omkar Sheral' }, { name: 'Two' })

    const [person] = await db.select().from(people).where(eq(people.email, 'omkar@gmail.com'))
    expect(person.name).toBe('Omkar Sheral')
  })

  it('compares the creator\'s email in lower case', async () => {
    await create(omkar)
    await create({ ...omkar, email: 'Omkar@Gmail.com' }, { name: 'Another' })
    expect(await db.select().from(people)).toHaveLength(1)
  })

  describe('refusing bad input', () => {
    it('reports every problem at once, one message per field', async () => {
      const result = await groupService.createGroup(db, omkar, {
        name: '   ',
        type: 'boat' as never,
        defaultCurrency: 'ZZZ',
        memberEmails: ['bob@yahoo.com'],
      })

      expect(result).toEqual({
        ok: false,
        errors: {
          name: 'Enter a group name.',
          type: 'Choose a group type.',
          defaultCurrency: 'Choose a currency.',
          memberEmails: 'Only @gmail.com addresses can be added: bob@yahoo.com',
        },
      })
    })

    it('asks for a name and a currency that were never filled in', async () => {
      const result = await groupService.createGroup(db, omkar, {
        type: 'trip',
        memberEmails: [],
      } as unknown as CreateGroupInput)

      expect(result).toEqual({
        ok: false,
        errors: { name: 'Enter a group name.', defaultCurrency: 'Choose a currency.' },
      })
    })

    it('refuses a name over 60 characters but accepts exactly 60', async () => {
      const tooLong = await groupService.createGroup(db, omkar, {
        ...validInput,
        name: 'x'.repeat(61),
      })
      expect(tooLong).toEqual({ ok: false, errors: { name: 'Use at most 60 characters.' } })

      await expect(create(omkar, { name: 'x'.repeat(60) })).resolves.toBeDefined()
    })

    it('lists every address that is not a Gmail address', async () => {
      const result = await groupService.createGroup(db, omkar, {
        ...validInput,
        memberEmails: ['ok@gmail.com', 'a@yahoo.com', 'notanemail', 'b@gmail.com.evil.com'],
      })

      expect(result).toEqual({
        ok: false,
        errors: {
          memberEmails:
            'Only @gmail.com addresses can be added: a@yahoo.com, notanemail, b@gmail.com.evil.com',
        },
      })
    })

    it('saves nothing when the input is refused', async () => {
      await groupService.createGroup(db, omkar, { ...validInput, name: '' })

      expect(await db.select().from(groups)).toHaveLength(0)
      expect(await db.select().from(people)).toHaveLength(0)
    })
  })

  describe('a group with the same name', () => {
    it('is refused, ignoring case and extra spaces', async () => {
      await create(omkar, { name: 'Goa trip' })

      for (const name of ['Goa trip', 'goa TRIP', '  Goa   trip ']) {
        const result = await groupService.createGroup(db, omkar, { ...validInput, name })
        expect(result).toEqual({
          ok: false,
          errors: { name: 'You already have a group called Goa trip.' },
        })
      }
      expect(await db.select().from(groups)).toHaveLength(1)
    })

    it('is refused when the saved name has extra spaces inside it', async () => {
      await create(omkar, { name: 'Goa    TRIP' })

      const result = await groupService.createGroup(db, omkar, { ...validInput, name: 'goa trip' })
      expect(result).toMatchObject({ ok: false, errors: { name: expect.any(String) } })
    })

    it('is refused when the existing group was made by someone else but you are in it', async () => {
      await create(priya, { name: 'Flat', memberEmails: ['omkar@gmail.com'] })

      const result = await groupService.createGroup(db, omkar, { ...validInput, name: 'flat' })
      expect(result).toMatchObject({ ok: false, errors: { name: expect.any(String) } })
    })

    it('is allowed when the other group belongs to people you are not with', async () => {
      await create(priya, { name: 'Flat' })
      await expect(create(omkar, { name: 'Flat' })).resolves.toBeDefined()
    })

    it('is allowed once the other group has been deleted', async () => {
      const first = await create(omkar, { name: 'Goa trip' })
      await db.update(groups).set({ deletedAt: new Date() }).where(eq(groups.id, first))

      await expect(create(omkar, { name: 'Goa trip' })).resolves.toBeDefined()
    })

    it('is allowed when you have left the other group', async () => {
      const first = await create(omkar, { name: 'Goa trip' })
      await db.update(groupMembers).set({ deletedAt: new Date() }).where(eq(groupMembers.groupId, first))

      await expect(create(omkar, { name: 'Goa trip' })).resolves.toBeDefined()
    })

    it('does not stop a different name', async () => {
      await create(omkar, { name: 'Goa trip' })
      await expect(create(omkar, { name: 'Goa trip 2' })).resolves.toBeDefined()
    })
  })
})

describe('listKnownPeople', () => {
  it('is empty for someone who has no groups yet', async () => {
    expect(await groupService.listKnownPeople(db, 'omkar@gmail.com')).toEqual([])
  })

  it('lists the people in your groups, never yourself, each once, in order', async () => {
    await create(omkar, { name: 'Goa', memberEmails: ['sam@gmail.com', 'priya@gmail.com'] })
    await create(omkar, { name: 'Flat', type: 'home', memberEmails: ['priya@gmail.com'] })
    await db.update(people).set({ name: 'Priya' }).where(eq(people.email, 'priya@gmail.com'))

    const known = await groupService.listKnownPeople(db, 'Omkar@Gmail.com')

    expect(known.map((person) => person.email)).toEqual(['priya@gmail.com', 'sam@gmail.com'])
    expect(known[0]).toMatchObject({ name: 'Priya' })
    expect(known[1].name).toBeNull()
  })

  it('leaves out people from groups you are not in', async () => {
    await create(omkar, { name: 'Goa', memberEmails: ['sam@gmail.com'] })
    await create(priya, { name: 'Flat', memberEmails: ['lee@gmail.com'] })

    const known = await groupService.listKnownPeople(db, 'omkar@gmail.com')
    expect(known.map((person) => person.email)).toEqual(['sam@gmail.com'])
  })

  it('leaves out deleted groups and people who left', async () => {
    const goa = await create(omkar, { name: 'Goa', memberEmails: ['sam@gmail.com'] })
    await create(omkar, { name: 'Flat', type: 'home', memberEmails: ['lee@gmail.com'] })
    await db.update(groups).set({ deletedAt: new Date() }).where(eq(groups.id, goa))

    const known = await groupService.listKnownPeople(db, 'omkar@gmail.com')
    expect(known.map((person) => person.email)).toEqual(['lee@gmail.com'])
  })
})

describe('normalizeMemberEmails', () => {
  it('trims, lower-cases and drops repeats and blanks', () => {
    expect(
      groupService.normalizeMemberEmails([' A@Gmail.com', 'a@gmail.com ', '', 'b@gmail.com']),
    ).toEqual(['a@gmail.com', 'b@gmail.com'])
  })
})
