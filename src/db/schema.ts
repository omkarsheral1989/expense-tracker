import { sql } from 'drizzle-orm'
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import { GROUP_NAME_MAX_LENGTH, GROUP_TYPES } from './constants.ts'
import type { GroupType } from './types.ts'

/**
 * Columns every synced table has: a UUID primary key (never auto-increment, so
 * rows created on different devices cannot collide), who last changed the row
 * and when, and a soft-delete marker (rows are never hard-deleted).
 *
 * `updated_at` is set by the application on every change; there is no trigger.
 * A function, because each table needs its own column builders.
 */
function syncColumns() {
  return {
    id: uuid('id').primaryKey().defaultRandom(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedBy: uuid('updated_by')
      .notNull()
      .references((): AnyPgColumn => people.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  }
}

/** One row per person, signed-in user or not, identified by email. */
export const people = pgTable(
  'people',
  {
    ...syncColumns(),
    /** Lower-case, unique. */
    email: text('email').notNull().unique(),
    name: text('name'),
  },
  (table) => [
    check('people_email_lowercase', sql`${table.email} = lower(${table.email})`),
  ],
)

export const groups = pgTable(
  'groups',
  {
    ...syncColumns(),
    name: text('name').notNull(),
    type: text('type').$type<GroupType>().notNull(),
    /**
     * Pre-fills the currency of new expenses in the group. An ISO 4217 code such
     * as 'INR'. Expenses can still use any other currency.
     */
    defaultCurrency: text('default_currency').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => people.id),
  },
  (table) => [
    check(
      'groups_name_length',
      sql`char_length(${table.name}) between 1 and ${sql.raw(String(GROUP_NAME_MAX_LENGTH))}`,
    ),
    // Only the shape (three upper-case letters). Whether it is a real currency
    // is checked by the application, which knows the list.
    check(
      'groups_default_currency_format',
      sql`${table.defaultCurrency} ~ '^[A-Z]{3}$'`,
    ),
    check(
      'groups_type_valid',
      sql`${table.type} in (${sql.raw(GROUP_TYPES.map((type) => `'${type}'`).join(', '))})`,
    ),
  ],
)

/** Links a person to a group. A person is in a group at most once. */
export const groupMembers = pgTable(
  'group_members',
  {
    ...syncColumns(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id),
  },
  (table) => [
    unique('group_members_group_person').on(table.groupId, table.personId),
    index('group_members_person_idx').on(table.personId),
  ],
)
