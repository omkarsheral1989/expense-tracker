import type { GROUP_TYPES } from './constants.ts'

/** One of the kinds of group a user can create: 'trip', 'home', 'couple' or 'other'. */
export type GroupType = (typeof GROUP_TYPES)[number]
