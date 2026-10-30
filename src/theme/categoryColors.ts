import type { CategoryGroupKey } from '../services/expenseService/types.ts'

/**
 * The color of each group of categories (Material Design's palette, shades 500 to 800, none of them red: red is for what is deleted), used for the tiles of its
 * categories. White icons sit on top of it. Every group must have an entry.
 */
export const CATEGORY_GROUP_COLORS: Record<CategoryGroupKey, string> = {
  entertainment: '#673ab7',
  food: '#ef6c00',
  health: '#00796b',
  home: '#388e3c',
  investments: '#ff8f00',
  life: '#3f51b5',
  loans: '#6d4c41',
  shopping: '#9c27b0',
  transport: '#1976d2',
  uncategorized: '#607d8b',
  settlement: '#689f38',
  utilities: '#0097a7',
}

/** The band of a deleted expense's page: red, whatever its category (PRD 5.6). */
export const DELETED_BAND_COLOR = '#c92a2a'
