import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import {
  EXPENSE_DESCRIPTION_MAX_LENGTH,
  EXPENSE_NOTES_MAX_LENGTH,
  GROUP_NAME_MAX_LENGTH,
  GROUP_TYPES,
  SPLIT_METHODS,
} from './constants.ts'
import type { GroupType, SplitMethod } from './types.ts'

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

/** Amounts are whole minor units (cents, paise), never fractions. */
function money(name: string) {
  return bigint(name, { mode: 'number' })
}

/**
 * One expense of a group. The amount is in minor units of its own currency,
 * which need not be the group's default. How it is divided is in
 * `expense_shares`; `method` says how those shares were worked out.
 */
export const expenses = pgTable(
  'expenses',
  {
    ...syncColumns(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id),
    description: text('description').notNull(),
    /** A stable key from the app's category list, such as 'food.dining_out'. */
    category: text('category').notNull(),
    amountMinor: money('amount_minor').notNull(),
    /** An ISO 4217 code such as 'INR'. */
    currency: text('currency').notNull(),
    /** The day the money was spent, without a time ('2026-10-08'). */
    date: date('date', { mode: 'string' }).notNull(),
    notes: text('notes'),
    method: text('method').$type<SplitMethod>().notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => people.id),
  },
  (table) => [
    check(
      'expenses_description_length',
      sql`char_length(${table.description}) between 1 and ${sql.raw(String(EXPENSE_DESCRIPTION_MAX_LENGTH))}`,
    ),
    check(
      'expenses_notes_length',
      sql`char_length(${table.notes}) <= ${sql.raw(String(EXPENSE_NOTES_MAX_LENGTH))}`,
    ),
    check('expenses_amount_positive', sql`${table.amountMinor} > 0`),
    check('expenses_currency_format', sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      'expenses_method_valid',
      sql`${table.method} in (${sql.raw(SPLIT_METHODS.map((method) => `'${method}'`).join(', '))})`,
    ),
    index('expenses_group_idx').on(table.groupId),
  ],
)

/**
 * One person's part in an expense: what they paid towards it and what they
 * owe of it. Across an expense's live rows both add up to its amount.
 */
export const expenseShares = pgTable(
  'expense_shares',
  {
    ...syncColumns(),
    expenseId: uuid('expense_id')
      .notNull()
      .references(() => expenses.id),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id),
    paidMinor: money('paid_minor').notNull().default(0),
    owedMinor: money('owed_minor').notNull().default(0),
    /**
     * What the user entered for this person under the expense's method: 1 or 0
     * (in the split or not) for 'equal', minor units for 'exact' and
     * 'adjustment', a whole percentage for 'percent', a number of shares for
     * 'shares'. Null when the person only paid.
     */
    inputValue: bigint('input_value', { mode: 'number' }),
  },
  (table) => [
    unique('expense_shares_expense_person').on(table.expenseId, table.personId),
    index('expense_shares_person_idx').on(table.personId),
    check('expense_shares_paid_not_negative', sql`${table.paidMinor} >= 0`),
    check('expense_shares_owed_not_negative', sql`${table.owedMinor} >= 0`),
  ],
)

/**
 * A receipt photo of an expense. Only what describes the photo is kept here;
 * the photo itself and its thumbnail are in the account's photo store
 * (IndexedDB), under this row's id.
 */
export const expensePhotos = pgTable(
  'expense_photos',
  {
    ...syncColumns(),
    expenseId: uuid('expense_id')
      .notNull()
      .references(() => expenses.id),
    /** The photo's place among the expense's photos, from 0. */
    position: integer('position').notNull(),
    /** Such as 'image/jpeg'. */
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  },
  (table) => [
    index('expense_photos_expense_idx').on(table.expenseId),
    check('expense_photos_is_image', sql`${table.mimeType} like 'image/%'`),
    check('expense_photos_size_not_negative', sql`${table.sizeBytes} >= 0`),
  ],
)
