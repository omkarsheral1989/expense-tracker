import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Database } from '../../db/client.ts'
import { expenses, groupMembers, groups, people } from '../../db/schema.ts'
import type { KnownPerson } from '../personService/types.ts'
import { createGroupSchema, toFieldErrors } from './schemas.ts'
import { displayName, shortName } from './utils.ts'
import type {
  CreateGroupInput,
  CreateGroupResult,
  GroupDetails,
  GroupMember,
  GroupSummary,
} from './types.ts'

/** A group name as compared for "already exists": no case, no extra spaces. */
function comparableName(name: string) {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const groupService = {
  /** A person's first name, or their email before the "@" when no name is known. */
  shortName,

  /** A person's name, or their email when no name is known. */
  displayName,

  /**
   * Creates a group with its members, all or nothing. The creator is always a
   * member. Anything wrong with the input comes back as one message per field,
   * to show beside it; only unexpected failures (such as a database error)
   * throw.
   */
  async createGroup(
    db: Database,
    creatorId: string,
    input: CreateGroupInput,
  ): Promise<CreateGroupResult> {
    const parsed = createGroupSchema.safeParse(input)
    if (!parsed.success) return { ok: false, errors: toFieldErrors(parsed.error) }

    const { name, type, defaultCurrency } = parsed.data

    return db.transaction(async (tx): Promise<CreateGroupResult> => {
      // Done in the same transaction as the insert, so nothing can slip in
      // between the check and the save. Only groups this person belongs to count.
      const [sameName] = await tx
        .select({ name: groups.name })
        .from(groups)
        .innerJoin(groupMembers, eq(groupMembers.groupId, groups.id))
        .where(
          and(
            eq(groupMembers.personId, creatorId),
            isNull(groupMembers.deletedAt),
            isNull(groups.deletedAt),
            sql`lower(regexp_replace(trim(${groups.name}), '\\s+', ' ', 'g')) = ${comparableName(name)}`,
          ),
        )
        .limit(1)
      if (sameName) {
        return {
          ok: false,
          errors: { name: `You already have a group called ${sameName.name}.` },
        }
      }

      // The creator is added automatically, so choosing them again is ignored.
      const chosenIds = parsed.data.memberIds.filter((id) => id !== creatorId)
      if (chosenIds.length > 0) {
        const found = await tx
          .select({ id: people.id })
          .from(people)
          .where(and(inArray(people.id, chosenIds), isNull(people.deletedAt)))
        if (found.length !== chosenIds.length) {
          return { ok: false, errors: { memberIds: 'Choose members from the list.' } }
        }
      }
      const memberIds = [creatorId, ...chosenIds]

      const [group] = await tx
        .insert(groups)
        .values({ name, type, defaultCurrency, createdBy: creatorId, updatedBy: creatorId })
        .returning({ id: groups.id })

      await tx.insert(groupMembers).values(
        memberIds.map((personId) => ({
          groupId: group.id,
          personId,
          updatedBy: creatorId,
        })),
      )

      return { ok: true, groupId: group.id }
    })
  },

  /**
   * The people saved on this device, for picking as members of a new group:
   * everyone except the user themselves, in alphabetical order by name (or
   * email when there is no name). Includes people added in the add-a-member
   * dialog who are not in any group yet.
   */
  async listKnownPeople(db: Database, userId: string): Promise<KnownPerson[]> {
    const rows = await db
      .select({ id: people.id, email: people.email, name: people.name })
      .from(people)
      .where(
        and(
          isNull(people.deletedAt),
          ne(people.id, userId),
        ),
      )

    const label = (person: KnownPerson) => displayName(person).toLowerCase()
    return rows.sort((a, b) => label(a).localeCompare(label(b)))
  },

  /**
   * The groups this user belongs to, most recently active first (ties by
   * name): a group's activity is the latest change to it or its expenses. Deleted groups, groups the user has left, and groups they were
   * never in are left out.
   */
  async listGroups(db: Database, userId: string): Promise<GroupSummary[]> {
    const myMembership = alias(groupMembers, 'my_membership')
    // The latest change to the group or to any of its expenses (deleted ones
    // too: deleting is a change).
    const lastActivityAt = sql<Date>`greatest(${groups.updatedAt}, (
      select max(${expenses.updatedAt}) from ${expenses}
      where ${expenses.groupId} = ${groups.id}
    ))`.mapWith(groups.updatedAt)
    return db
      .select({
        id: groups.id,
        name: groups.name,
        type: groups.type,
        defaultCurrency: groups.defaultCurrency,
        lastActivityAt,
        memberCount: sql<number>`(
          select count(*) from ${groupMembers}
          where ${groupMembers.groupId} = ${groups.id} and ${groupMembers.deletedAt} is null
        )`.mapWith(Number),
      })
      .from(groups)
      .innerJoin(
        myMembership,
        and(
          eq(myMembership.groupId, groups.id),
          eq(myMembership.personId, userId),
          isNull(myMembership.deletedAt),
        ),
      )
      .where(isNull(groups.deletedAt))
      .orderBy(desc(lastActivityAt), asc(groups.name), asc(groups.id))
  },

  /**
   * One group with its members, for the group page. Null when there is no such
   * group for this user: an unknown id, a deleted group, or one they are not in
   * (or have left). The three cases look the same on purpose, so the page does
   * not reveal whether a group exists.
   */
  async getGroup(
    db: Database,
    userId: string,
    groupId: string,
  ): Promise<GroupDetails | null> {
    if (!UUID.test(groupId)) return null

    const [group] = await db
      .select({
        id: groups.id,
        name: groups.name,
        type: groups.type,
        defaultCurrency: groups.defaultCurrency,
      })
      .from(groups)
      .where(and(eq(groups.id, groupId), isNull(groups.deletedAt)))
    if (!group) return null

    const rows = await db
      .select({ personId: people.id, email: people.email, name: people.name })
      .from(groupMembers)
      .innerJoin(people, and(eq(people.id, groupMembers.personId), isNull(people.deletedAt)))
      .where(and(eq(groupMembers.groupId, groupId), isNull(groupMembers.deletedAt)))

    if (!rows.some((row) => row.personId === userId)) return null

    const members: GroupMember[] = rows.map((row) => ({
      ...row,
      isYou: row.personId === userId,
    }))
    const label = (member: GroupMember) => displayName(member).toLowerCase()
    members.sort(
      (a, b) => Number(b.isYou) - Number(a.isYou) || label(a).localeCompare(label(b)),
    )

    return { ...group, members }
  },
}
