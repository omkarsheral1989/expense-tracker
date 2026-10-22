import { Empty, Flex, Typography } from 'antd'
import type { ExpenseListItem } from '../../../../services/expenseService/types.ts'
import { ABOVE_FLOATING_BUTTON, FLOATING_BUTTON_ROOM } from '../../../../components/FloatingPillButton/constants.ts'
import { dateService } from '../../../../services/dateService'
import { ExpenseRow } from './ExpenseRow'
import { groupByMonth, type MonthOfExpenses } from './utils.ts'
import { aboveScreenEdge } from '../../../../theme/safeArea.ts'

const { Text } = Typography

type Props = {
  /** Newest day first, as the service returns them. */
  expenses: ExpenseListItem[]
  groupId: string
}

/**
 * The group's expenses, newest first and grouped under a "September 2025"
 * header for each month, or a message when there are none yet. The
 * message's box runs from the actions down to just above the floating Add
 * expense button, and the message is centered in it. (Not on the whole screen:
 * the band, the balance and the actions take the top of it, and the button the
 * bottom, so that would look off.) The space between the actions and the list
 * belongs to the list, not to the page, so the box starts right under the actions.
 */
export function ExpenseList({ expenses, groupId }: Props) {
  function renderExpense(expense: ExpenseListItem) {
    return <ExpenseRow key={expense.id} expense={expense} groupId={groupId} />
  }

  function renderMonth({ month, expenses }: MonthOfExpenses) {
    const headingId = `expenses-${month}`
    return (
      <Flex vertical key={month}>
        <Text id={headingId} type="secondary" strong role="heading" aria-level={2} style={{ paddingTop: 8 }}>
          {dateService.formatMonth(`${month}-01`)}
        </Text>
        <Flex vertical role="list" aria-labelledby={headingId}>
          {expenses.map(renderExpense)}
        </Flex>
      </Flex>
    )
  }

  if (expenses.length === 0) {
    return (
      <Flex align="center" justify="center" style={{ flex: 1, marginBottom: aboveScreenEdge(ABOVE_FLOATING_BUTTON) }}>
        <Empty
          description={
            <>
              <Text strong>No expenses yet</Text>
              <br />
              <Text type="secondary">Expenses you add will appear here.</Text>
            </>
          }
        />
      </Flex>
    )
  }

  return (
    <Flex
      vertical
      gap={8}
      role="region"
      aria-label="Expenses"
      style={{ marginTop: 16, paddingBottom: aboveScreenEdge(FLOATING_BUTTON_ROOM) }}
    >
      {groupByMonth(expenses).map(renderMonth)}
    </Flex>
  )
}
