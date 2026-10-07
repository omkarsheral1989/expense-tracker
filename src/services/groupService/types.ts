import type { Database } from '../../db/client.ts'
import type { GroupType } from '../../db/types.ts'

/** What the create-group form sends. Emails may be in any case and repeated. */
export type CreateGroupInput = {
  name: string
  type: GroupType
  /** An ISO 4217 code such as 'INR'. */
  defaultCurrency: string
  /** The members to add besides the creator, who is always added. */
  memberEmails: string[]
}

/** The fields of the form a problem can be attached to. */
export type CreateGroupField = keyof CreateGroupInput

/** One message per field, shown beside that field. */
export type CreateGroupErrors = Partial<Record<CreateGroupField, string>>

export type CreateGroupResult =
  | { ok: true; groupId: string }
  | { ok: false; errors: CreateGroupErrors }

/** Who is creating the group: the signed-in user. */
export type Creator = {
  email: string
  name: string
}

/** A person already known on this device, for picking as a member. */
export type KnownPerson = {
  id: string
  email: string
  name: string | null
}

/** One row of the home page's list of groups. */
export type GroupSummary = {
  id: string
  name: string
  type: GroupType
  /** An ISO 4217 code such as 'INR'. */
  defaultCurrency: string
  /** Everyone currently in the group, the user included. */
  memberCount: number
  /** When the group was last changed. The list is ordered by it, newest first. */
  updatedAt: Date
}

/** A person in a group, as the group page shows them. */
export type GroupMember = {
  personId: string
  email: string
  name: string | null
  /** Whether this member is the user looking at the group. */
  isYou: boolean
}

/** Everything the group page shows about one group. */
export type GroupDetails = {
  id: string
  name: string
  type: GroupType
  defaultCurrency: string
  /** The user first, then the others A to Z by name (or email when there is no name). */
  members: GroupMember[]
}

/** A database transaction, which has the same query methods as the database. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
