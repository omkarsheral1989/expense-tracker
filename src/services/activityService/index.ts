import { and, desc, eq, gt, inArray, isNull, ne, not, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Database } from '../../db/client.ts'
import { deletedHere } from '../../db/groupDeleted.ts'
import { eventArrivals, expenseEvents, groupMembers, groups, people, syncStatus } from '../../db/schema.ts'
import { shownName } from '../../db/shownName.ts'
import { SETTLEMENT_CATEGORY } from '../expenseService/constants.ts'
import { historyEntryOf, peopleReferredBy } from '../expenseService/history.ts'
import type { ExpensePerson } from '../expenseService/types.ts'
import { logService } from '../logService'
import { ACTIVITY_PAGE_SIZE, ACTIVITY_SEEN_SCOPE } from './constants.ts'
import type { ActivityCursor, ActivityItem, ActivityPage, UnreadState } from './types.ts'

/** The groups the user is in: live groups where they have a live membership. */
function userGroups(db: Pick<Database, 'select'>, userId: string) {
  return db
    .select({ id: groups.id, name: groups.name })
    .from(groupMembers)
    .innerJoin(groups, and(eq(groups.id, groupMembers.groupId), isNull(groups.deletedAt)))
    // Groups the user deleted on this device have nothing in the feed and nothing unread; a change by another member brings them back (ADR-069).
    .where(and(eq(groupMembers.personId, userId), isNull(groupMembers.deletedAt), not(deletedHere(groups.id))))
}

const activityServiceBase = {
  /**
   * The events of expenses and payments in the user's groups, newest first, one
   * batch at a time (`after` is the previous batch's `next`). Events of groups the
   * user left, that were deleted, or that the user deleted on this device (ADR-069) are left out (ADR-062).
   */
  async listActivity(
    db: Database,
    userId: string,
    { limit = ACTIVITY_PAGE_SIZE, after = null }: { limit?: number; after?: ActivityCursor | null } = {},
  ): Promise<ActivityPage> {
    const mine = userGroups(db, userId).as('mine')
    const actor = alias(people, 'actor')
    const restoredFrom = alias(expenseEvents, 'restored_from_event')

    const rows = await db
      .select({
        id: expenseEvents.id,
        kind: expenseEvents.kind,
        occurredAt: expenseEvents.occurredAt,
        occurredAtText: sql<string>`${expenseEvents.occurredAt}::text`,
        changes: expenseEvents.changes,
        snapshot: expenseEvents.snapshot,
        expenseId: expenseEvents.expenseId,
        groupId: expenseEvents.groupId,
        groupName: mine.name,
        actorId: actor.id,
        actorEmail: actor.email,
        actorName: shownName(actor),
        actorPicture: actor.picture,
        restoredFromAt: restoredFrom.occurredAt,
        arrivedAt: eventArrivals.arrivedAt,
      })
      .from(expenseEvents)
      .innerJoin(mine, eq(mine.id, expenseEvents.groupId))
      .innerJoin(actor, eq(actor.id, expenseEvents.actedBy))
      .leftJoin(restoredFrom, eq(restoredFrom.id, expenseEvents.restoredFrom))
      .leftJoin(eventArrivals, eq(eventArrivals.eventId, expenseEvents.id))
      .where(
        after
          ? sql`(${expenseEvents.occurredAt}, ${expenseEvents.id}) < (${after.occurredAt}::timestamptz, ${after.id}::uuid)`
          : undefined,
      )
      .orderBy(desc(expenseEvents.occurredAt), desc(expenseEvents.id))
      // One more than asked for, to know whether there is a next batch.
      .limit(limit + 1)
    const more = rows.length > limit
    if (more) rows.pop()
    const last = rows.at(-1)
    const next: ActivityCursor | null = more && last ? { occurredAt: last.occurredAtText, id: last.id } : null
    if (rows.length === 0) return { items: [], next: null }

    // The payer and recipient of each payment, named as the user sees them.
    const paymentPeople = new Set<string>()
    for (const row of rows) {
      if (row.snapshot.category !== SETTLEMENT_CATEGORY) continue
      for (const share of row.snapshot.shares) if (share.paidMinor > 0 || share.owedMinor > 0) paymentPeople.add(share.personId)
    }
    const named = paymentPeople.size
      ? await db
          .select({ id: people.id, email: people.email, name: shownName(people) })
          .from(people)
          .where(inArray(people.id, [...paymentPeople]))
      : []
    const personOf = (id: string | undefined): ExpensePerson => {
      const found = named.find((person) => person.id === id)
      return { email: found?.email ?? null, name: found?.name ?? null, isYou: id === userId }
    }
    const referred = await peopleReferredBy(db, userId, rows.map((row) => row.changes))

    const items: ActivityItem[] = rows.map((row) => {
      const entry = historyEntryOf(row, userId, row.restoredFromAt ?? undefined)
      const isPayment = row.snapshot.category === SETTLEMENT_CATEGORY
      const payerId = row.snapshot.shares.find((share) => share.paidMinor > 0)?.personId
      const recipientId = row.snapshot.shares.find((share) => share.owedMinor > 0)?.personId
      return {
        id: row.id,
        entry,
        by: { ...entry.by, picture: row.actorPicture },
        groupId: row.groupId,
        groupName: row.groupName,
        expenseId: row.expenseId,
        description: row.snapshot.description,
        category: row.snapshot.category,
        amountMinor: row.snapshot.amountMinor,
        currency: row.snapshot.currency,
        payment: isPayment ? { payer: personOf(payerId), recipient: personOf(recipientId) } : null,
        people: referred,
        arrivedAt: row.arrivedAt,
      }
    })
    return { items, next }
  },

  /**
   * When the user last left the Activity page here, and whether an event by
   * another member reached the device after that (everything counts on a first
   * visit). Events of groups the user is not in do not count.
   */
  async unreadState(db: Database, userId: string): Promise<UnreadState> {
    const [seen] = await db.select().from(syncStatus).where(eq(syncStatus.scope, ACTIVITY_SEEN_SCOPE))
    const seenAt = seen?.lastSyncedAt ?? null
    const mine = userGroups(db, userId).as('mine')
    const [unread] = await db
      .select({ id: eventArrivals.eventId })
      .from(eventArrivals)
      .innerJoin(expenseEvents, eq(expenseEvents.id, eventArrivals.eventId))
      .innerJoin(mine, eq(mine.id, expenseEvents.groupId))
      .where(and(ne(expenseEvents.actedBy, userId), seenAt ? gt(eventArrivals.arrivedAt, seenAt) : undefined))
      .limit(1)
    return { seenAt, hasUnread: Boolean(unread) }
  },

  /** Remembers that the user has seen the Activity page up to now. */
  async markSeen(db: Database): Promise<void> {
    const at = new Date()
    await db
      .insert(syncStatus)
      .values({ scope: ACTIVITY_SEEN_SCOPE, lastSyncedAt: at })
      .onConflictDoUpdate({ target: syncStatus.scope, set: { lastSyncedAt: at } })
  },
}

/**
 * activityService with one log line per action (ADR-048). `markSeen` does not announce a data change (ADR-051): that
 * would make the app forget the Activity page the user has just left, so coming back would show its loader. The page
 * refreshes the avatar menu's dot itself.
 */
export const activityService: typeof activityServiceBase = logService.logActions(logService.scope('activity'), activityServiceBase, {
  markSeen: { message: 'Activity marked as seen', params: [] },
})
