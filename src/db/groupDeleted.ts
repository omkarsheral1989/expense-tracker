import { sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

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
