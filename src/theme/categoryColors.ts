import type { CategoryGroupKey } from '../services/expenseService/types.ts'

/**
 * The color of each group of categories, used for the tiles of its
 * categories. White icons sit on top of it. Every group must have an entry.
 */
export const CATEGORY_GROUP_COLORS: Record<CategoryGroupKey, string> = {
  entertainment: '#7048e8',
  food: '#e8590c',
  home: '#2f9e44',
  life: '#c2255c',
  transport: '#1971c2',
  uncategorized: '#868e96',
  utilities: '#0c8599',
}
