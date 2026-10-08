import { Empty, Typography } from 'antd'

const { Text } = Typography

/**
 * The group's expenses, newest first. There are none yet, so for now this only
 * shows the empty message. Later each row shows the date (month over day), a
 * colored category tile, the title with who paid under it, and on the right
 * "you lent" (green) or "you borrowed" (orange-red) with the amount.
 */
export function ExpenseList() {
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
