import { eq } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { people } from '../db/schema.ts'
import { groupService } from '../services/groupService'
import type { CreateGroupInput, CreateGroupResult, Creator } from '../services/groupService/types.ts'

/** The id of the person with this email, added (with no name) when nobody has it yet. */
async function ensurePersonId(db: Database, email: string, name: string | null, addedBy?: string) {
  const [existing] = await db.select({ id: people.id }).from(people).where(eq(people.email, email))
  if (existing) return existing.id
  const id = crypto.randomUUID()
  await db.insert(people).values({ id, email, name, updatedBy: addedBy ?? id })
  return id
}

/**
 * The ids of the people with these emails, for `createGroup`'s `memberIds`:
 * anyone not saved yet is added first (as the creator would have added them).
 */
export async function memberIdsOf(db: Database, creator: Creator, emails: string[]): Promise<string[]> {
  const creatorId = await ensurePersonId(db, creator.email.toLowerCase(), creator.name)
  const ids: string[] = []
  for (const email of emails) {
    ids.push(await ensurePersonId(db, email.toLowerCase(), null, creatorId))
  }
  return ids
}

/**
 * Saves a person with a name, and an email when given, as `creator` would have
 * added them in the add-a-member dialog. Returns their id.
 */
export async function addTestPerson(
  db: Database,
  creator: Creator,
  { name, email = null }: { name: string; email?: string | null },
): Promise<string> {
  const creatorId = await ensurePersonId(db, creator.email.toLowerCase(), creator.name)
  const id = crypto.randomUUID()
  await db.insert(people).values({ id, name, email, updatedBy: creatorId })
  return id
}

/**
 * What `createTestGroup` takes: the group's fields, with members as emails
 * (added as people when not saved yet) and/or as ids of people already saved.
 */
export type TestGroupInput = Omit<CreateGroupInput, 'memberIds'> & {
  memberEmails?: string[]
  memberIds?: string[]
}

/** Creates a group with members given by email, adding any of them who are not saved yet. */
export async function createTestGroup(
  db: Database,
  creator: Creator,
  { memberEmails = [], memberIds = [], ...input }: TestGroupInput,
): Promise<CreateGroupResult> {
  const emailIds = await memberIdsOf(db, creator, memberEmails)
  return groupService.createGroup(db, creator, { ...input, memberIds: [...memberIds, ...emailIds] })
}
