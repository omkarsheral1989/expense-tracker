import { and, asc, desc, eq, isNull, ne, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Database } from '../../db/client.ts'
import { groupMembers, groups, people } from '../../db/schema.ts'
import { MEMBER_EMAIL_DOMAIN } from './constants.ts'
import { createGroupSchema, normalizeEmails, toFieldErrors } from './schemas.ts'
import type {
  CreateGroupInput,
  CreateGroupResult,
  Creator,
  GroupDetails,
  GroupMember,
  GroupSummary,
  KnownPerson,
  Transaction,
} from './types.ts'

/** A group name as compared for "already exists": no case, no extra spaces. */
function comparableName(name: string) {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The id of the person with this email, or null when nobody has it. */
async function findPersonId(db: Database, email: string): Promise<string | null> {
  const [person] = await db
    .select({ id: people.id })
    .from(people)
    .where(eq(people.email, email.trim().toLowerCase()))
  return person?.id ?? null
}

/** Finds the person with this email, or adds them. Returns their id. */
async function findOrAddPerson(
  tx: Transaction,
  { email, name }: { email: string; name: string | null },
  /** Who is adding them. Leave out when a person adds themselves. */
  addedBy?: string,
): Promise<string> {
  const [existing] = await tx
    .select({ id: people.id, name: people.name })
    .from(people)
    .where(eq(people.email, email))

  if (existing) {
    // Keep a person's own name up to date when they sign in.
    if (addedBy === undefined && name && existing.name !== name) {
      await tx
        .update(people)
        .set({ name, updatedAt: new Date(), updatedBy: existing.id })
        .where(eq(people.id, existing.id))
    }
    return existing.id
  }

  // A person who adds themselves is their own `updated_by`.
  const id = crypto.randomUUID()
  await tx.insert(people).values({ id, email, name, updatedBy: addedBy ?? id })
  return id
}

export const groupService = {
  /** The domain every member's address must have. */
  memberEmailDomain: MEMBER_EMAIL_DOMAIN,

  /** Trims and lower-cases addresses and drops repeats, as creating a group does. */
  normalizeMemberEmails: normalizeEmails,

  /**
   * Creates a group with its members, all or nothing. The creator is always a
   * member. Anything wrong with the input comes back as one message per field,
   * to show beside it; only unexpected failures (such as a database error)
   * throw.
   */
  async createGroup(
    db: Database,
    creator: Creator,
    input: CreateGroupInput,
  ): Promise<CreateGroupResult> {
    const parsed = createGroupSchema.safeParse(input)
    if (!parsed.success) return { ok: false, errors: toFieldErrors(parsed.error) }

    const { name, type, defaultCurrency } = parsed.data
    const creatorEmail = creator.email.toLowerCase()
    // The creator is added automatically, so typing their own address is ignored.
    const memberEmails = parsed.data.memberEmails.filter(
      (email) => email !== creatorEmail,
    )

    return db.transaction(async (tx): Promise<CreateGroupResult> => {
      const creatorId = await findOrAddPerson(tx, {
        email: creatorEmail,
        name: creator.name,
      })

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

      const memberIds = [creatorId]
      for (const email of memberEmails) {
        memberIds.push(await findOrAddPerson(tx, { email, name: null }, creatorId))
      }

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
   * The people this user already shares a group with, for picking as members of
   * a new one: everyone in their groups except themselves, each listed once,
   * in alphabetical order.
   */
  async listKnownPeople(db: Database, userEmail: string): Promise<KnownPerson[]> {
    const [user] = await db
      .select({ id: people.id })
      .from(people)
      .where(eq(people.email, userEmail.toLowerCase()))
    if (!user) return []

    const myMembership = alias(groupMembers, 'my_membership')
    const rows = await db
      .selectDistinct({ id: people.id, email: people.email, name: people.name })
      .from(myMembership)
      .innerJoin(
        groups,
        and(eq(groups.id, myMembership.groupId), isNull(groups.deletedAt)),
      )
      .innerJoin(
        groupMembers,
        and(
          eq(groupMembers.groupId, groups.id),
          isNull(groupMembers.deletedAt),
          ne(groupMembers.personId, user.id),
        ),
      )
      .innerJoin(
        people,
        and(eq(people.id, groupMembers.personId), isNull(people.deletedAt)),
      )
      .where(and(eq(myMembership.personId, user.id), isNull(myMembership.deletedAt)))

    const label = (person: KnownPerson) => (person.name ?? person.email).toLowerCase()
    return rows.sort((a, b) => label(a).localeCompare(label(b)))
  },

  /**
   * The groups this user belongs to, most recently changed first (ties by
   * name). Deleted groups, groups the user has left, and groups they were
   * never in are left out.
   */
  async listGroups(db: Database, userEmail: string): Promise<GroupSummary[]> {
    const userId = await findPersonId(db, userEmail)
    if (!userId) return []

    const myMembership = alias(groupMembers, 'my_membership')
    return db
      .select({
        id: groups.id,
        name: groups.name,
        type: groups.type,
        defaultCurrency: groups.defaultCurrency,
        updatedAt: groups.updatedAt,
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
      .orderBy(desc(groups.updatedAt), asc(groups.name), asc(groups.id))
  },

  /**
   * One group with its members, for the group page. Null when there is no such
   * group for this user: an unknown id, a deleted group, or one they are not in
   * (or have left). The three cases look the same on purpose, so the page does
   * not reveal whether a group exists.
   */
  async getGroup(
    db: Database,
    userEmail: string,
    groupId: string,
  ): Promise<GroupDetails | null> {
    const userId = await findPersonId(db, userEmail)
    if (!userId || !UUID.test(groupId)) return null

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
    const label = (member: GroupMember) => (member.name ?? member.email).toLowerCase()
    members.sort(
      (a, b) => Number(b.isYou) - Number(a.isYou) || label(a).localeCompare(label(b)),
    )

    return { ...group, members }
  },
}
