import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase, type Database } from '../../../db/client.ts'
import { expenseEvents, expenseShares, expenses, groupMembers, groups, people } from '../../../db/schema.ts'
import type { Profile } from '../../googleProfileService/types.ts'
import { userService } from '../index.ts'

let pg: PGlite
let db: Database

beforeAll(async () => {
  pg = new PGlite()
  db = await createDatabase(pg)
})

afterAll(() => pg.close())

beforeEach(() => pg.exec('truncate expense_photos, expense_shares, expenses, group_members, groups, people cascade'))

const omkar: Profile = { id: 'g-omkar', email: 'omkar@gmail.com', name: 'Omkar Sheral' }

/** A person someone added as a member (with an email, as they would in a group). */
async function addMember(email: string, name: string | null, addedBy: string) {
  const id = crypto.randomUUID()
  await db.insert(people).values({ id, email, name, updatedBy: addedBy })
  return id
}

describe('userService.resolve', () => {
  describe('for a guest', () => {
    it('adds the guest\'s own person, named Guest, with no email, under the id on record', async () => {
      const id = crypto.randomUUID()

      const user = await userService.resolve(db, { userPersonId: id }, null)

      expect(user).toEqual({ personId: id, name: 'Guest', email: null })
      const [row] = await db.select().from(people)
      expect(row).toMatchObject({ id, name: 'Guest', email: null, updatedBy: id })
    })

    it('only reads the second time', async () => {
      const id = crypto.randomUUID()
      await userService.resolve(db, { userPersonId: id }, null)
      const [before] = await db.select().from(people)

      const again = await userService.resolve(db, { userPersonId: id }, null)

      expect(again.personId).toBe(id)
      expect(await db.select().from(people)).toEqual([before])
    })

    it('keeps the person of an account that has signed out: their name and email', async () => {
      const first = await userService.resolve(db, { userPersonId: null }, omkar)

      const guest = await userService.resolve(db, { userPersonId: first.personId }, null)

      expect(guest).toEqual({ personId: first.personId, name: 'Omkar Sheral', email: 'omkar@gmail.com' })
    })
  })

  describe('signing in with Google', () => {
    it('adds the account\'s person for a new user', async () => {
      const user = await userService.resolve(db, { userPersonId: null }, omkar)

      expect(user).toEqual({ personId: expect.any(String), name: 'Omkar Sheral', email: 'omkar@gmail.com' })
      expect(await db.select().from(people)).toHaveLength(1)
    })

    it('finds the person with the account\'s email when none is on record (data made before guests)', async () => {
      const id = crypto.randomUUID()
      const [existing] = await db
        .insert(people)
        .values({ id, email: 'omkar@gmail.com', name: null, updatedBy: id })
        .returning()

      const user = await userService.resolve(db, { userPersonId: null }, omkar)

      expect(user.personId).toBe(existing.id)
      expect(user.name).toBe('Omkar Sheral')
      expect(await db.select().from(people)).toHaveLength(1)
    })

    it('gives a guest\'s person the account\'s email and name, keeping their id and everything they made', async () => {
      const guestId = crypto.randomUUID()
      await userService.resolve(db, { userPersonId: guestId }, null)
      const [group] = await db
        .insert(groups)
        .values({ name: 'Goa', type: 'trip', defaultCurrency: 'GBP', createdBy: guestId, updatedBy: guestId })
        .returning()

      const user = await userService.resolve(db, { userPersonId: guestId }, omkar)

      expect(user).toEqual({ personId: guestId, name: 'Omkar Sheral', email: 'omkar@gmail.com' })
      expect(await db.select().from(people)).toHaveLength(1)
      const [still] = await db.select().from(groups).where(eq(groups.id, group.id))
      expect(still.createdBy).toBe(guestId)
    })

    it('updates the name when the account\'s name changes', async () => {
      await userService.resolve(db, { userPersonId: null }, omkar)
      const [row] = await db.select().from(people)

      const user = await userService.resolve(db, { userPersonId: row.id }, { ...omkar, name: 'Omkar S.' })

      expect(user.name).toBe('Omkar S.')
      const [updated] = await db.select().from(people)
      expect(updated.name).toBe('Omkar S.')
    })

    it('does nothing the second time, when the person already has the account\'s email and name', async () => {
      const first = await userService.resolve(db, { userPersonId: null }, omkar)
      const [before] = await db.select().from(people)

      const again = await userService.resolve(db, { userPersonId: first.personId }, omkar)

      expect(again).toEqual(first)
      expect(await db.select().from(people)).toEqual([before])
    })
  })

  describe('when a member already has the account\'s email', () => {
    /** A guest and a member (Omkar, added to a group by someone), with groups and an expense they share. */
    async function guestAndMember() {
      const guestId = crypto.randomUUID()
      await userService.resolve(db, { userPersonId: guestId }, null)
      const memberId = await addMember('omkar@gmail.com', null, guestId)
      const sam = await addMember('sam@gmail.com', 'Sam', guestId)

      const [shared, onlyGuest, onlyMember] = await db
        .insert(groups)
        .values([
          { name: 'Shared', type: 'trip', defaultCurrency: 'GBP', createdBy: guestId, updatedBy: guestId },
          { name: 'Guest only', type: 'home', defaultCurrency: 'GBP', createdBy: guestId, updatedBy: guestId },
          { name: 'Member only', type: 'other', defaultCurrency: 'GBP', createdBy: sam, updatedBy: sam },
        ])
        .returning()
      await db.insert(groupMembers).values([
        { groupId: shared.id, personId: guestId, updatedBy: guestId },
        { groupId: shared.id, personId: memberId, updatedBy: guestId },
        { groupId: onlyGuest.id, personId: guestId, updatedBy: guestId },
        { groupId: onlyMember.id, personId: memberId, updatedBy: sam },
        { groupId: onlyMember.id, personId: sam, updatedBy: sam },
      ])
      const [both, soloGuest] = await db
        .insert(expenses)
        .values([
          { groupId: shared.id, description: 'Dinner', category: 'general', amountMinor: 1000, currency: 'GBP', date: '2026-10-01', method: 'equal', createdBy: guestId, updatedBy: guestId },
          { groupId: onlyGuest.id, description: 'Rent', category: 'general', amountMinor: 500, currency: 'GBP', date: '2026-10-02', method: 'equal', createdBy: memberId, updatedBy: memberId },
        ])
        .returning()
      await db.insert(expenseShares).values([
        { expenseId: both.id, personId: guestId, paidMinor: 1000, owedMinor: 300, inputValue: 1, updatedBy: guestId },
        { expenseId: both.id, personId: memberId, paidMinor: 0, owedMinor: 300, inputValue: 1, updatedBy: guestId },
        { expenseId: both.id, personId: sam, paidMinor: 0, owedMinor: 400, inputValue: 1, updatedBy: guestId },
        { expenseId: soloGuest.id, personId: guestId, paidMinor: 500, owedMinor: 500, inputValue: 1, updatedBy: guestId },
      ])
      return { guestId, memberId, sam, shared, onlyGuest, onlyMember, both, soloGuest }
    }

    it('merges the guest into that member: one person, who is the user', async () => {
      const { guestId, memberId } = await guestAndMember()

      const user = await userService.resolve(db, { userPersonId: guestId }, omkar)

      expect(user).toEqual({ personId: memberId, name: 'Omkar Sheral', email: 'omkar@gmail.com' })
      expect(await db.select().from(people).where(eq(people.id, guestId))).toEqual([])
      expect((await db.select().from(people)).map((person) => person.email).sort()).toEqual(['omkar@gmail.com', 'sam@gmail.com'])
    })

    it('keeps one membership in a group both were in, and moves the others', async () => {
      const { guestId, memberId, shared, onlyGuest, onlyMember } = await guestAndMember()

      await userService.resolve(db, { userPersonId: guestId }, omkar)

      const rows = await db.select().from(groupMembers)
      const of = (groupId: string) => rows.filter((row) => row.groupId === groupId).map((row) => row.personId)
      expect(of(shared.id)).toEqual([memberId])
      expect(of(onlyGuest.id)).toEqual([memberId])
      expect(of(onlyMember.id).filter((id) => id === memberId)).toEqual([memberId])
      expect(rows.some((row) => row.personId === guestId)).toBe(false)
    })

    it('makes a group member live again when only the guest\'s membership was live', async () => {
      const { guestId, memberId, shared } = await guestAndMember()
      await db.update(groupMembers).set({ deletedAt: new Date() }).where(eq(groupMembers.personId, memberId))

      await userService.resolve(db, { userPersonId: guestId }, omkar)

      const [row] = await db.select().from(groupMembers).where(eq(groupMembers.groupId, shared.id))
      expect(row).toMatchObject({ personId: memberId, deletedAt: null })
    })

    it('adds together the shares of an expense both were in, and moves the rest', async () => {
      const { guestId, memberId, sam, both, soloGuest } = await guestAndMember()

      await userService.resolve(db, { userPersonId: guestId }, omkar)

      const shares = await db.select().from(expenseShares)
      const mine = shares.find((share) => share.expenseId === both.id && share.personId === memberId)
      expect(mine).toMatchObject({ paidMinor: 1000, owedMinor: 600, inputValue: 2 })
      expect(shares.find((share) => share.expenseId === both.id && share.personId === sam)).toMatchObject({ owedMinor: 400 })
      expect(shares.filter((share) => share.expenseId === both.id)).toHaveLength(2)
      expect(shares.find((share) => share.expenseId === soloGuest.id)).toMatchObject({ personId: memberId, paidMinor: 500 })
      // Still adds up to the amount.
      const total = shares.filter((share) => share.expenseId === both.id).reduce((sum, share) => sum + share.owedMinor, 0)
      expect(total).toBe(1000)
    })

    it('points everything the guest made or changed at the member', async () => {
      const { guestId, memberId, shared, both } = await guestAndMember()

      await userService.resolve(db, { userPersonId: guestId }, omkar)

      const [group] = await db.select().from(groups).where(eq(groups.id, shared.id))
      expect(group).toMatchObject({ createdBy: memberId, updatedBy: memberId })
      const [expense] = await db.select().from(expenses).where(eq(expenses.id, both.id))
      expect(expense).toMatchObject({ createdBy: memberId, updatedBy: memberId })
      const everyone = await db.select().from(people)
      expect(everyone.some((person) => person.updatedBy === guestId)).toBe(false)
    })

    it('points the history at the member: who acted, who changed it, and the people inside its snapshots', async () => {
      const { guestId, memberId, shared, both } = await guestAndMember()
      const snapshot = {
        description: 'Dinner', category: 'general', amountMinor: 1000, currency: 'GBP', date: '2026-10-01',
        notes: null, method: 'equal' as const, photos: [],
        shares: [{ personId: guestId, paidMinor: 1000, owedMinor: 500, inputValue: 1 }],
      }
      await db.insert(expenseEvents).values({
        groupId: shared.id, expenseId: both.id, kind: 'edited', actedBy: guestId, occurredAt: new Date(),
        snapshot, changes: [{ field: 'paidBy', from: memberId, to: guestId }], updatedBy: guestId,
      })

      await userService.resolve(db, { userPersonId: guestId }, omkar)

      const [event] = await db.select().from(expenseEvents)
      expect(event).toMatchObject({ actedBy: memberId, updatedBy: memberId })
      expect(event.snapshot.shares[0].personId).toBe(memberId)
      expect(event.changes).toEqual([{ field: 'paidBy', from: memberId, to: memberId }])
    })

    it('can be repeated without changing anything', async () => {
      const { guestId, memberId } = await guestAndMember()
      await userService.resolve(db, { userPersonId: guestId }, omkar)
      const shares = await db.select().from(expenseShares)

      const again = await userService.resolve(db, { userPersonId: memberId }, omkar)

      expect(again.personId).toBe(memberId)
      expect(await db.select().from(expenseShares)).toEqual(shares)
    })
  })

  it('names a guest\'s person with the shared guest name', () => {
    expect(userService.guestName).toBe('Guest')
  })
})
