import { eq, sql } from 'drizzle-orm'
import { expensePhotos, expenseShares, expenses, groupMembers, groups, people } from '../../db/schema.ts'
import type { Transaction } from '../groupService/types.ts'

/**
 * Folds one person into another: everything that pointed at `fromId` points at
 * `intoId`, then `fromId` is removed. Where both are in the same group or
 * the same expense, the two rows become one (shares are added together).
 * Used when a guest signs in with an email that a member already has.
 */
export async function mergePeople(tx: Transaction, fromId: string, intoId: string) {
  // A group both belong to: keep one membership, live if either was live.
  await tx.execute(sql`
    update group_members i set deleted_at = null
    where i.person_id = ${intoId} and i.deleted_at is not null
      and exists (select 1 from group_members g where g.group_id = i.group_id
                  and g.person_id = ${fromId} and g.deleted_at is null)`)
  await tx.execute(sql`
    delete from group_members g
    where g.person_id = ${fromId}
      and exists (select 1 from group_members i where i.group_id = g.group_id and i.person_id = ${intoId})`)
  await tx.update(groupMembers).set({ personId: intoId }).where(eq(groupMembers.personId, fromId))

  // An expense both have a share in: one share with both parts added up.
  await tx.execute(sql`
    update expense_shares i
    set paid_minor = i.paid_minor + g.paid_minor,
        owed_minor = i.owed_minor + g.owed_minor,
        input_value = case when i.input_value is null and g.input_value is null then null
                           else coalesce(i.input_value, 0) + coalesce(g.input_value, 0) end
    from expense_shares g
    where g.person_id = ${fromId} and i.person_id = ${intoId} and g.expense_id = i.expense_id`)
  await tx.execute(sql`
    delete from expense_shares g
    where g.person_id = ${fromId}
      and exists (select 1 from expense_shares i where i.expense_id = g.expense_id and i.person_id = ${intoId})`)
  await tx.update(expenseShares).set({ personId: intoId }).where(eq(expenseShares.personId, fromId))

  // Who made or changed anything.
  await tx.update(groups).set({ createdBy: intoId }).where(eq(groups.createdBy, fromId))
  await tx.update(expenses).set({ createdBy: intoId }).where(eq(expenses.createdBy, fromId))
  for (const table of [people, groups, groupMembers, expenses, expenseShares, expensePhotos]) {
    await tx.update(table).set({ updatedBy: intoId }).where(eq(table.updatedBy, fromId))
  }

  await tx.delete(people).where(eq(people.id, fromId))
}
