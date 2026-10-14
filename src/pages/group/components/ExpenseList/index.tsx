import { Empty, Flex, Typography } from 'antd'
import type { ExpenseListItem } from '../../../../services/expenseService/types.ts'
import { ABOVE_FLOATING_BUTTON, FLOATING_BUTTON_ROOM } from '../../../../components/FloatingPillButton/constants.ts'
import { ExpenseRow } from './ExpenseRow'

const { Text } = Typography

type Props = {
  /** Newest day first, as the service returns them. */
  expenses: ExpenseListItem[]
  groupId: string
}

/**
 * The group's expenses, newest first, or a message when there are none yet. The
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

  if (expenses.length === 0) {
    return (
      <Flex align="center" justify="center" style={{ flex: 1, marginBottom: ABOVE_FLOATING_BUTTON }}>
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
      role="list"
      aria-label="Expenses"
      style={{ marginTop: 16, paddingBottom: FLOATING_BUTTON_ROOM }}
    >
      {expenses.map(renderExpense)}
    </Flex>
  )
}
