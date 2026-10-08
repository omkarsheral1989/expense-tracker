import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase, type Database } from '../../../db/client.ts'
import { expenses, groupMembers, groups, people } from '../../../db/schema.ts'
import { addTestExpense } from '../../../testing/expenses.ts'
import { groupService } from '../index.ts'
import type { CreateGroupInput, Creator } from '../types.ts'

let pg: PGlite
let db: Database

beforeAll(async () => {
  pg = new PGlite()
  db = await createDatabase(pg)
})

afterAll(() => pg.close())

beforeEach(() => pg.exec('truncate expense_shares, expenses, group_members, groups, people cascade'))

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

/** Sets when a group was last changed, so ordering can be tested exactly. */
async function changedAt(groupId: string, iso: string) {
  await db.update(groups).set({ updatedAt: new Date(iso) }).where(eq(groups.id, groupId))
}

async function personId(email: string) {
  const [person] = await db.select({ id: people.id }).from(people).where(eq(people.email, email))
  return person.id
}

describe('listGroups', () => {
  it('is empty for someone with no groups, and for someone unknown', async () => {
    expect(await groupService.listGroups(db, 'nobody@gmail.com')).toEqual([])

    await create(priya, { name: 'Flat' })
    expect(await groupService.listGroups(db, 'omkar@gmail.com')).toEqual([])
  })

  it('lists each group with its type, currency and member count', async () => {
    const goa = await create(omkar, {
      name: 'Goa trip',
      defaultCurrency: 'GBP',
      memberEmails: ['priya@gmail.com', 'sam@gmail.com'],
    })
    const flat = await create(omkar, { name: 'Flat', type: 'home', defaultCurrency: 'INR' })

    const list = await groupService.listGroups(db, 'omkar@gmail.com')

    expect(list).toHaveLength(2)
    expect(list.find((group) => group.id === goa)).toMatchObject({
      name: 'Goa trip',
      type: 'trip',
      defaultCurrency: 'GBP',
      memberCount: 3,
    })
    expect(list.find((group) => group.id === flat)).toMatchObject({
      name: 'Flat',
      type: 'home',
      defaultCurrency: 'INR',
      memberCount: 1,
    })
    expect(list[0].lastActivityAt).toBeInstanceOf(Date)
  })

  it('puts the most recently changed group first, then orders ties by name', async () => {
    const old = await create(omkar, { name: 'Old' })
    const recent = await create(omkar, { name: 'Recent' })
    const tieB = await create(omkar, { name: 'Bravo' })
    const tieA = await create(omkar, { name: 'Alpha' })
    await changedAt(old, '2026-01-01T00:00:00Z')
    await changedAt(recent, '2026-03-01T00:00:00Z')
    await changedAt(tieB, '2026-02-01T00:00:00Z')
    await changedAt(tieA, '2026-02-01T00:00:00Z')

    const names = (await groupService.listGroups(db, 'omkar@gmail.com')).map((group) => group.name)
    expect(names).toEqual(['Recent', 'Alpha', 'Bravo', 'Old'])

    // Changing a group moves it to the top.
    await changedAt(old, '2026-06-01T00:00:00Z')
    const after = (await groupService.listGroups(db, 'omkar@gmail.com')).map((group) => group.name)
    expect(after[0]).toBe('Old')
  })

  it('counts a change to an expense as activity in its group', async () => {
    const quiet = await create(omkar, { name: 'Quiet' })
    const busy = await create(omkar, { name: 'Busy' })
    await changedAt(quiet, '2026-03-01T00:00:00Z')
    await changedAt(busy, '2026-01-01T00:00:00Z')
    const expenseId = await addTestExpense(db, omkar.email, busy, { date: '2026-01-01' })

    // An expense changed after both groups pulls its group to the top.
    await db
      .update(expenses)
      .set({ updatedAt: new Date('2026-04-01T00:00:00Z') })
      .where(eq(expenses.id, expenseId))
    let names = (await groupService.listGroups(db, 'omkar@gmail.com')).map((group) => group.name)
    expect(names).toEqual(['Busy', 'Quiet'])

    // An older expense does not pull the group up past a newer change.
    await db
      .update(expenses)
      .set({ updatedAt: new Date('2026-02-01T00:00:00Z') })
      .where(eq(expenses.id, expenseId))
    names = (await groupService.listGroups(db, 'omkar@gmail.com')).map((group) => group.name)
    expect(names).toEqual(['Quiet', 'Busy'])
    const busyRow = (await groupService.listGroups(db, 'omkar@gmail.com'))[1]
    expect(busyRow.lastActivityAt).toEqual(new Date('2026-02-01T00:00:00Z'))
  })

  it('includes groups someone else made, when you are a member', async () => {
    await create(priya, { name: 'Flat', memberEmails: ['omkar@gmail.com'] })

    const list = await groupService.listGroups(db, 'omkar@gmail.com')
    expect(list.map((group) => group.name)).toEqual(['Flat'])
  })

  it('leaves out other people\'s groups, deleted groups and groups you have left', async () => {
    await create(priya, { name: 'Not mine' })
    const deleted = await create(omkar, { name: 'Deleted' })
    const left = await create(omkar, { name: 'Left' })
    await create(omkar, { name: 'Kept' })
    await db.update(groups).set({ deletedAt: new Date() }).where(eq(groups.id, deleted))
    await db
      .update(groupMembers)
      .set({ deletedAt: new Date() })
      .where(eq(groupMembers.groupId, left))

    const names = (await groupService.listGroups(db, 'omkar@gmail.com')).map((group) => group.name)
    expect(names).toEqual(['Kept'])
  })

  it('does not count members who have left', async () => {
    const goa = await create(omkar, { name: 'Goa', memberEmails: ['priya@gmail.com', 'sam@gmail.com'] })
    await db
      .update(groupMembers)
      .set({ deletedAt: new Date() })
      .where(eq(groupMembers.personId, await personId('sam@gmail.com')))

    const [group] = await groupService.listGroups(db, 'omkar@gmail.com')
    expect(group.id).toBe(goa)
    expect(group.memberCount).toBe(2)
  })

  it('finds the user whatever the case of their email', async () => {
    await create(omkar, { name: 'Goa' })
    expect(await groupService.listGroups(db, '  Omkar@GMAIL.com ')).toHaveLength(1)
  })
})

describe('getGroup', () => {
  it('returns the group with its details', async () => {
    const id = await create(omkar, { name: 'Goa trip', type: 'couple', defaultCurrency: 'EUR' })

    expect(await groupService.getGroup(db, 'omkar@gmail.com', id)).toMatchObject({
      id,
      name: 'Goa trip',
      type: 'couple',
      defaultCurrency: 'EUR',
    })
  })

  it('lists you first, then the others A to Z by name or email', async () => {
    const id = await create(omkar, {
      name: 'Goa',
      memberEmails: ['zed@gmail.com', 'sam@gmail.com', 'priya@gmail.com', 'amy@gmail.com'],
    })
    await db.update(people).set({ name: 'Zoe' }).where(eq(people.email, 'amy@gmail.com'))
    await db.update(people).set({ name: 'Bea' }).where(eq(people.email, 'zed@gmail.com'))

    const group = await groupService.getGroup(db, 'omkar@gmail.com', id)

    // Zoe and Bea have names; the rest are sorted by their email.
    expect(group?.members.map((member) => member.name ?? member.email)).toEqual([
      'Omkar', 'Bea', 'priya@gmail.com', 'sam@gmail.com', 'Zoe',
    ])
  })

  it('marks only the user as you, and carries each member\'s email', async () => {
    const id = await create(omkar, { name: 'Goa', memberEmails: ['priya@gmail.com'] })

    const group = await groupService.getGroup(db, 'omkar@gmail.com', id)

    expect(group?.members).toEqual([
      { personId: await personId('omkar@gmail.com'), email: 'omkar@gmail.com', name: 'Omkar', isYou: true },
      { personId: await personId('priya@gmail.com'), email: 'priya@gmail.com', name: null, isYou: false },
    ])
  })

  it('shows the group from the point of view of whoever looks at it', async () => {
    const id = await create(omkar, { name: 'Goa', memberEmails: ['priya@gmail.com'] })

    const group = await groupService.getGroup(db, 'priya@gmail.com', id)
    expect(group?.members.map((member) => [member.email, member.isYou])).toEqual([
      ['priya@gmail.com', true],
      ['omkar@gmail.com', false],
    ])
  })

  it('leaves out members who have left', async () => {
    const id = await create(omkar, { name: 'Goa', memberEmails: ['priya@gmail.com', 'sam@gmail.com'] })
    await db
      .update(groupMembers)
      .set({ deletedAt: new Date() })
      .where(eq(groupMembers.personId, await personId('sam@gmail.com')))

    const group = await groupService.getGroup(db, 'omkar@gmail.com', id)
    expect(group?.members.map((member) => member.email)).toEqual(['omkar@gmail.com', 'priya@gmail.com'])
  })

  describe('says there is no such group (null) when', () => {
    it('the id is unknown', async () => {
      await create(omkar, { name: 'Goa' })
      expect(await groupService.getGroup(db, 'omkar@gmail.com', crypto.randomUUID())).toBeNull()
    })

    it('the id is not even an id', async () => {
      await create(omkar, { name: 'Goa' })
      for (const bad of ['', 'abc', '123', "'; drop table groups; --", '../etc']) {
        expect(await groupService.getGroup(db, 'omkar@gmail.com', bad)).toBeNull()
      }
    })

    it('the group has been deleted', async () => {
      const id = await create(omkar, { name: 'Goa' })
      await db.update(groups).set({ deletedAt: new Date() }).where(eq(groups.id, id))
      expect(await groupService.getGroup(db, 'omkar@gmail.com', id)).toBeNull()
    })

    it('you are not in the group, which looks the same as an unknown group', async () => {
      // The user is a known person with a group of their own, so it is the
      // membership that is checked, not whether they exist.
      await create(omkar, { name: 'Mine' })
      const id = await create(priya, { name: 'Flat' })
      expect(await groupService.getGroup(db, 'omkar@gmail.com', id)).toBeNull()
    })

    it('you have left the group', async () => {
      const id = await create(omkar, { name: 'Goa', memberEmails: ['priya@gmail.com'] })
      await db
        .update(groupMembers)
        .set({ deletedAt: new Date() })
        .where(eq(groupMembers.personId, await personId('omkar@gmail.com')))
      expect(await groupService.getGroup(db, 'omkar@gmail.com', id)).toBeNull()
    })

    it('the user is not a known person at all', async () => {
      const id = await create(omkar, { name: 'Goa' })
      expect(await groupService.getGroup(db, 'stranger@gmail.com', id)).toBeNull()
    })
  })

  it('finds the group whatever the case of the id and the email', async () => {
    const id = await create(omkar, { name: 'Goa' })
    expect(await groupService.getGroup(db, ' OMKAR@gmail.com', id.toUpperCase())).not.toBeNull()
  })
})
