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
