import { and, eq, isNull, sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import type { Database } from './client.ts'
import { groupDeletions } from './schema.ts'

/**
 * True for a group the user deleted on this device (ADR-069): it has a row in
 * `group_deletions` that has not been restored. Every query that lists groups
 * or their events for a screen leaves such groups out with `not(deletedHere(…))`.
 */
export function deletedHere(groupId: AnyPgColumn) {
  return sql<boolean>`exists (
    select 1 from group_deletions
    where group_deletions.group_id = ${groupId} and group_deletions.deleted_at is null
  )`
}

/**
 * Brings a group the user deleted on this device back onto their list because they changed something in it (PRD 5.22): an edit of
 * one of its expenses, found through Activity or a version. Does nothing for a group that is not deleted here, or that someone else deleted (on this device only the user changes data through the services). The group's name
 * cannot have been taken meanwhile, since a deleted group keeps its name.
 */
export async function undeleteGroup(tx: Pick<Database, 'update'>, groupId: string, userId: string, at: Date) {
  await tx
    .update(groupDeletions)
    .set({ deletedAt: at, updatedAt: at, updatedBy: userId })
    .where(and(eq(groupDeletions.groupId, groupId), eq(groupDeletions.updatedBy, userId), isNull(groupDeletions.deletedAt)))
}
