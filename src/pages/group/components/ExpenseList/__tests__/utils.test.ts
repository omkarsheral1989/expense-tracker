import { describe, expect, it } from 'vitest'
import type { ExpenseListItem } from '../../../../../services/expenseService/types.ts'
import { groupByMonth } from '../utils.ts'

function expenseOn(id: string, date: string): ExpenseListItem {
  return { id, date } as ExpenseListItem
}

describe('groupByMonth', () => {
  it('has no groups for no expenses', () => {
    expect(groupByMonth([])).toEqual([])
  })

  it('keeps the order and starts a new group each time the month changes', () => {
    const groups = groupByMonth([
      expenseOn('a', '2026-10-14'),
      expenseOn('b', '2026-10-01'),
      expenseOn('c', '2026-09-30'),
      expenseOn('d', '2025-09-23'),
    ])

    expect(groups.map((group) => [group.month, group.expenses.map((expense) => expense.id)])).toEqual([
      ['2026-10', ['a', 'b']],
      ['2026-09', ['c']],
      ['2025-09', ['d']],
    ])
  })

  it('tells the same month of different years apart', () => {
    const months = groupByMonth([expenseOn('a', '2026-09-02'), expenseOn('b', '2025-09-02')]).map(
      (group) => group.month,
    )
    expect(months).toEqual(['2026-09', '2025-09'])
  })
})
