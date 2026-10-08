import type { GroupType } from './types.ts'

/** The kinds of group a user can create. Each has its own icon in the app. */
export const GROUP_TYPES = ['trip', 'home', 'couple', 'other'] as const

/** Longest group name accepted by the database and the create-group form. */
export const GROUP_NAME_MAX_LENGTH = 60

/** How each kind of group is called on screen. Every type must have an entry. */
export const GROUP_TYPE_LABELS: Record<GroupType, string> = {
  trip: 'Trip',
  home: 'Home',
  couple: 'Couple',
  other: 'Other',
}

/** Longest expense description accepted by the database and the add-expense form. */
export const EXPENSE_DESCRIPTION_MAX_LENGTH = 100

/** Longest note on an expense. */
export const EXPENSE_NOTES_MAX_LENGTH = 1000

/**
 * How an expense is divided. Each member's share row keeps what the user typed
 * for the method (`input_value`), so the split can be shown and edited again.
 */
export const SPLIT_METHODS = ['equal', 'exact', 'percent', 'shares', 'adjustment'] as const
