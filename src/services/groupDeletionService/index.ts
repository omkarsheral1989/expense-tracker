import { and, desc, eq, gt, isNull, ne } from 'drizzle-orm'
import { notifyAfter } from '../../db/changes.ts'
import type { Database } from '../../db/client.ts'
import { eventArrivals, expenseEvents, groupDeletions, groupMembers, people } from '../../db/schema.ts'
import { shownName } from '../../db/shownName.ts'
import { balancesService } from '../balancesService'
import { groupService } from '../groupService'
import { logService } from '../logService'
import type { AutoRestoreResult, DeleteGroupResult, RestoreGroupResult } from './types.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A group name as compared for "already exists": no case, no extra spaces (as in `groupService`). */
const comparable = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase()

const groupDeletionServiceBase = {
  /**
   * Deletes a group on this device only (ADR-069, PRD 5.22): it is hidden from the user's lists, and nothing changes for any other
   * member or in the group's rows, so nothing is sent through sync. Only a settled group can be deleted: while anybody owes anybody
   * anything, in any currency, nothing is done and the balances come back for the dialog to list. A group that does not exist for
   * the user, or is already deleted here, comes back as `notFound`.
   */
  async deleteGroup(db: Database, userId: string, groupId: string): Promise<DeleteGroupResult> {
    if (!UUID.test(groupId)) return { ok: false, notFound: true }
    const balances = await balancesService.groupBalances(db, userId, groupId)
    if (!balances) return { ok: false, notFound: true }
    const [existing] = await db.select().from(groupDeletions).where(eq(groupDeletions.groupId, groupId))
    if (existing && !existing.deletedAt) return { ok: false, notFound: true }
    if (balances.currencies.length > 0) return { ok: false, notSettled: true, balances }

    const now = new Date()
    if (existing) {
      // Deleted before and restored since: the same row is used again.
      await db.update(groupDeletions).set({ deletedAt: null, since: now, updatedAt: now, updatedBy: userId }).where(eq(groupDeletions.id, existing.id))
    } else {
      await db.insert(groupDeletions).values({ groupId, since: now, updatedAt: now, updatedBy: userId })
    }
    return { ok: true }
  },

  /**
   * Puts a group the user deleted here back on their lists (PRD 5.23). Refused with a message when another group on their list
   * already has its name; `notFound` for a group that is not deleted here or that the user is not in.
   */
  async restoreGroup(db: Database, userId: string, groupId: string): Promise<RestoreGroupResult> {
    if (!UUID.test(groupId)) return { ok: false, notFound: true }
    const group = await groupService.getGroup(db, userId, groupId, { includeDeleted: true })
    if (!group?.deletedSince) return { ok: false, notFound: true }

    // The groups on the user's list: those deleted here do not count.
    const clash = (await groupService.listGroups(db, userId)).find((other) => other.id !== groupId && comparable(other.name) === comparable(group.name))
    if (clash) return { ok: false, message: `You already have a group called ${clash.name}.` }

    const now = new Date()
    await db.update(groupDeletions).set({ deletedAt: now, updatedAt: now, updatedBy: userId }).where(eq(groupDeletions.groupId, groupId))
    return { ok: true }
  },

  /**
   * Called after a group's sync: restores a group that is deleted here when another member changed it after it was deleted (an event
   * of theirs reached this device, or they added a member), so it is on the home list again (PRD 5.22). The user's own changes never
   * count. Says who made the change, for the sync dialog's line.
   */
  async restoreIfChanged(db: Database, userId: string, groupId: string): Promise<AutoRestoreResult> {
    const [deletion] = await db.select().from(groupDeletions).where(and(eq(groupDeletions.groupId, groupId), isNull(groupDeletions.deletedAt)))
    if (!deletion) return { restored: false }

    const [event] = await db
      .select({ by: expenseEvents.actedBy })
      .from(eventArrivals)
      .innerJoin(expenseEvents, eq(expenseEvents.id, eventArrivals.eventId))
      .where(and(eq(expenseEvents.groupId, groupId), ne(expenseEvents.actedBy, userId), gt(eventArrivals.arrivedAt, deletion.since)))
      .orderBy(desc(eventArrivals.arrivedAt))
      .limit(1)
    const [member] = event
      ? []
      : await db
          .select({ by: groupMembers.updatedBy })
          .from(groupMembers)
          .where(and(eq(groupMembers.groupId, groupId), ne(groupMembers.updatedBy, userId), gt(groupMembers.updatedAt, deletion.since)))
          .orderBy(desc(groupMembers.updatedAt))
          .limit(1)
    const by = (event ?? member)?.by
    if (!by) return { restored: false }

    const now = new Date()
    await db.update(groupDeletions).set({ deletedAt: now, updatedAt: now, updatedBy: userId }).where(eq(groupDeletions.id, deletion.id))
    const [person] = await db.select({ email: people.email, name: shownName(people) }).from(people).where(eq(people.id, by))
    return { restored: true, changedBy: person ? groupService.shortName(person) : null }
  },
}

/**
 * groupDeletionService with one log line per action (ADR-048). Deleting and restoring announce a change (ADR-051); the
 * automatic restore does not, since the sync that calls it announces when it ends.
 */
export const groupDeletionService: typeof groupDeletionServiceBase = notifyAfter(
  logService.logActions(logService.scope('group'), groupDeletionServiceBase, {
    deleteGroup: { message: 'Group deleted on this device', params: ['userId', 'groupId'] },
    restoreGroup: { message: 'Group restored on this device', params: ['userId', 'groupId'] },
    restoreIfChanged: { message: 'Group checked for changes after deleting', params: ['userId', 'groupId'] },
  }),
  ['deleteGroup', 'restoreGroup'],
)
