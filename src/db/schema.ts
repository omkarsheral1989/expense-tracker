import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import {
  ACCOUNT_KINDS,
  ACCOUNT_NAME_MAX_LENGTH,
  EXPENSE_DESCRIPTION_MAX_LENGTH,
  EXPENSE_EVENT_KINDS,
  EXPENSE_NOTES_MAX_LENGTH,
  GROUP_NAME_MAX_LENGTH,
  GROUP_TYPES,
  MAX_STATEMENT_DAY,
  SPEND_TARGET_PERIODS,
  SPLIT_METHODS,
} from './constants.ts'
import type {
  AccountKind,
  ExpenseChange,
  ExpenseEventKind,
  ExpenseSnapshot,
  GroupType,
  SpendTargetPeriod,
  SplitMethod,
} from './types.ts'

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

/**
 * One row per person, signed-in user or not. A person is identified by `id`;
 * the email is optional (a member added by name only has none).
 */
export const people = pgTable(
  'people',
  {
    ...syncColumns(),
    /** Lower-case and unique when there is one; null for a person added without an email. */
    email: text('email').unique(),
    name: text('name'),
    /**
     * What this device calls the person instead of `name`. Private to the device:
     * kept in the backup, never written to a group's files (ADR-045).
     */
    localName: text('local_name'),
    /**
     * The address of the person's Google profile picture, set by their own
     * device when they sign in and carried to the other members by sync
     * (ADR-046). Null when nobody has seen them signed in.
     */
    picture: text('picture'),
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
    /** When the expense was added; set once, never changed by an edit. */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
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
 * the photo itself and its thumbnail are in the device's photo store
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

/**
 * Legacy (ADR-042): the edit history before expense events replaced it. Nothing
 * reads or writes it any more; it stays defined so that `drizzle-kit` does not
 * generate a DROP TABLE by itself, until a migration drops it on purpose.
 *
 * The history of an expense: one row each time someone saved an edit that
 * changed something. It is only ever inserted, never updated or deleted, so
 * `updated_at` equals `edited_at` and `deleted_at` stays null. The expense
 * itself holds the current version; a revision holds the version before that
 * edit and what the edit changed.
 */
export const expenseRevisions = pgTable(
  'expense_revisions',
  {
    ...syncColumns(),
    expenseId: uuid('expense_id')
      .notNull()
      .references(() => expenses.id),
    editedBy: uuid('edited_by')
      .notNull()
      .references(() => people.id),
    editedAt: timestamp('edited_at', { withTimezone: true }).notNull(),
    /** The expense as it was before this edit. */
    before: jsonb('before').$type<ExpenseSnapshot>().notNull(),
    /** What this edit changed, one entry per field, with old and new values. */
    changes: jsonb('changes').$type<ExpenseChange[]>().notNull(),
  },
  (table) => [index('expense_revisions_expense_idx').on(table.expenseId)],
)

/**
 * Everything that happens to an expense, one row per event: it was added,
 * edited, deleted or restored (ADR-042). Only ever inserted, never updated or
 * deleted, so `updated_at` equals `occurred_at` and `deleted_at` stays null.
 * The expense itself holds the current state; the events are its whole
 * history, and the source of the Activity page. `group_id` and `kind` let
 * events of groups join the same feed later.
 */
export const expenseEvents = pgTable(
  'expense_events',
  {
    ...syncColumns(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id),
    expenseId: uuid('expense_id')
      .notNull()
      .references(() => expenses.id),
    kind: text('kind').$type<ExpenseEventKind>().notNull(),
    actedBy: uuid('acted_by')
      .notNull()
      .references(() => people.id),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    /** The whole expense as it is right after this event. */
    snapshot: jsonb('snapshot').$type<ExpenseSnapshot>().notNull(),
    /** What an 'edited' or 'reverted' event changed, with old and new values; empty for the other kinds. */
    changes: jsonb('changes').$type<ExpenseChange[]>().notNull().default([]),
    /** For a 'reverted' event: the event whose version was put back. */
    restoredFrom: uuid('restored_from').references((): AnyPgColumn => expenseEvents.id),
  },
  (table) => [
    check(
      'expense_events_kind',
      sql`${table.kind} in (${sql.raw(EXPENSE_EVENT_KINDS.map((kind) => `'${kind}'`).join(', '))})`,
    ),
    index('expense_events_expense_idx').on(table.expenseId, table.occurredAt),
    index('expense_events_group_idx').on(table.groupId, table.occurredAt),
  ],
)

/**
 * One of the user's own bank accounts or credit cards (ADR-061). Private: it is
 * in the backup, never in a group's file. Money is in minor units of `currency`,
 * the currency the account is debited in. The card-only columns stay null for a
 * bank account.
 */
export const accounts = pgTable(
  'accounts',
  {
    ...syncColumns(),
    kind: text('kind').$type<AccountKind>().notNull(),
    name: text('name').notNull(),
    /** An ISO 4217 code such as 'INR'. */
    currency: text('currency').notNull(),
    /** Card only: the day of the month the statement is issued, 1 to 28. */
    statementDay: integer('statement_day'),
    /** Card only: the credit limit in minor units. */
    creditLimitMinor: money('credit_limit_minor'),
    /** Card only: the spend target in minor units, per `spendTargetPeriod`. */
    spendTargetMinor: money('spend_target_minor'),
    spendTargetPeriod: text('spend_target_period').$type<SpendTargetPeriod>(),
  },
  (table) => [
    check(
      'accounts_name_length',
      sql`char_length(${table.name}) between 1 and ${sql.raw(String(ACCOUNT_NAME_MAX_LENGTH))}`,
    ),
    check('accounts_currency_format', sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      'accounts_kind_valid',
      sql`${table.kind} in (${sql.raw(ACCOUNT_KINDS.map((kind) => `'${kind}'`).join(', '))})`,
    ),
    check(
      'accounts_statement_day_range',
      sql`${table.statementDay} is null or ${table.statementDay} between 1 and ${sql.raw(String(MAX_STATEMENT_DAY))}`,
    ),
    check(
      'accounts_amounts_positive',
      sql`(${table.creditLimitMinor} is null or ${table.creditLimitMinor} > 0) and (${table.spendTargetMinor} is null or ${table.spendTargetMinor} > 0)`,
    ),
    check(
      'accounts_spend_target_period_valid',
      sql`(${table.spendTargetMinor} is null) = (${table.spendTargetPeriod} is null) and (${table.spendTargetPeriod} is null or ${table.spendTargetPeriod} in (${sql.raw(SPEND_TARGET_PERIODS.map((period) => `'${period}'`).join(', '))}))`,
    ),
    check(
      'accounts_card_only_columns',
      sql`${table.kind} = 'card' or (${table.statementDay} is null and ${table.creditLimitMinor} is null and ${table.spendTargetMinor} is null)`,
    ),
  ],
)

/**
 * Which of the user's accounts paid an expense, and what it was debited when
 * that differs from the expense's amount (ADR-061). Private like `accounts`:
 * a table of its own, so the shared expense row, its events and its group files
 * never carry it. At most one row per expense; clearing it sets `deleted_at`.
 */
export const expensePayments = pgTable(
  'expense_payments',
  {
    ...syncColumns(),
    expenseId: uuid('expense_id')
      .notNull()
      .references(() => expenses.id),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    /** What the account was debited, in its own currency; null when not entered. */
    chargedMinor: money('charged_minor'),
  },
  (table) => [
    unique('expense_payments_expense').on(table.expenseId),
    index('expense_payments_account_idx').on(table.accountId),
    check('expense_payments_charged_positive', sql`${table.chargedMinor} is null or ${table.chargedMinor} > 0`),
  ],
)

/**
 * When this device last finished a backup or a group's sync (ADR-044). Local
 * to the device: it is never synced or backed up, so it has none of the sync
 * columns. `scope` is 'backup', or 'group:<group id>' for a group's sync.
 */
export const syncStatus = pgTable('sync_status', {
  scope: text('scope').primaryKey(),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).notNull(),
})

/**
 * When an event of another member reached this device through a sync, for the
 * Activity page's unread marker (ADR-062). Local to the device: never synced or
 * backed up, so it has none of the sync columns. Nothing is recorded for the
 * user's own actions.
 */
export const eventArrivals = pgTable('event_arrivals', {
  eventId: uuid('event_id')
    .primaryKey()
    .references(() => expenseEvents.id),
  arrivedAt: timestamp('arrived_at', { withTimezone: true }).notNull(),
})
