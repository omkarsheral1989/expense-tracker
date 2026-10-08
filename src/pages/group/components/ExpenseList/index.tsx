import { Empty, Flex, Typography } from 'antd'
import type { ExpenseListItem } from '../../../../services/expenseService/types.ts'
import { ExpenseRow } from './ExpenseRow'

const { Text } = Typography

type Props = {
  /** Newest day first, as the service returns them. */
  expenses: ExpenseListItem[]
}

/** The group's expenses, newest first, or a message when there are none yet. */
export function ExpenseList({ expenses }: Props) {
  function renderExpense(expense: ExpenseListItem) {
    return <ExpenseRow key={expense.id} expense={expense} />
  }

  if (expenses.length === 0) {
    return (
      <Empty
        style={{ padding: '32px 0' }}
        description={
          <>
            <Text strong>No expenses yet</Text>
            <br />
            <Text type="secondary">Expenses you add will appear here.</Text>
          </>
        }
      />
    )
  }

  return (
    <Flex vertical role="list" aria-label="Expenses">
      {expenses.map(renderExpense)}
    </Flex>
  )
}
