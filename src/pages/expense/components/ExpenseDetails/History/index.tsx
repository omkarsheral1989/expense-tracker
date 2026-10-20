import { Divider, Flex, Typography } from 'antd'
import { expenseService } from '../../../../../services/expenseService'
import type { ExpenseDetails } from '../../../../../services/expenseService/types.ts'
import { HistoryEntry } from './HistoryEntry'
import { historyHeader, historyLines } from './utils.ts'

const { Text } = Typography

type Props = {
  expense: ExpenseDetails
}

/**
 * Everything that happened to an expense, newest first: that it was deleted,
 * each edit with what it changed, and last that it was added. Shown only once
 * the expense has been edited or deleted.
 */
export function History({ expense }: Props) {
  if (expense.history.length === 0 && !expense.deleted) return null
  const noun = expense.category === expenseService.settlementCategory ? 'payment' : 'expense'

  return (
    <>
      <Divider style={{ margin: '16px 0' }} />
      <Text strong style={{ display: 'block', marginBottom: 12 }}>
        History
      </Text>
      <Flex vertical gap={16} role="list" aria-label="History">
        {expense.deleted && (
          <HistoryEntry header={historyHeader(expense.deleted.by, 'deleted', noun)} at={expense.deleted.at} />
        )}
        {expense.history.map((entry) => (
          <HistoryEntry
            key={entry.at.getTime()}
            header={historyHeader(entry.by, 'edited')}
            at={entry.at}
            lines={historyLines(entry, expense.people)}
          />
        ))}
        <HistoryEntry header={historyHeader(expense.createdBy, 'added', noun)} at={expense.createdAt} />
      </Flex>
    </>
  )
}
