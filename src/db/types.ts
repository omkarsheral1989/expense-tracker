import type { GROUP_TYPES, SPLIT_METHODS } from './constants.ts'

/** One of the kinds of group a user can create: 'trip', 'home', 'couple' or 'other'. */
export type GroupType = (typeof GROUP_TYPES)[number]

/** How an expense is divided: 'equal', 'exact', 'percent', 'shares' or 'adjustment'. */
export type SplitMethod = (typeof SPLIT_METHODS)[number]
