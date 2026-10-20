import { Divider, Flex, Typography } from 'antd'
import type { ExpenseDetails } from '../../../../../services/expenseService/types.ts'
import { HistoryEntry } from './HistoryEntry'
import { historyHeader, historyLines } from './utils.ts'

const { Text } = Typography

type Props = {
  expense: ExpenseDetails
}

/**
 * Everything that happened to an expense, newest first: each edit with what it
 * changed, and last that it was added. Shown only once the expense has been edited.
 */
export function History({ expense }: Props) {
  if (expense.history.length === 0) return null

  return (
    <>
      <Divider style={{ margin: '16px 0' }} />
      <Text strong style={{ display: 'block', marginBottom: 12 }}>
        History
      </Text>
      <Flex vertical gap={16} role="list" aria-label="History">
        {expense.history.map((entry) => (
          <HistoryEntry
            key={entry.at.getTime()}
            header={historyHeader(entry.by, 'edited')}
            at={entry.at}
            lines={historyLines(entry, expense.people)}
          />
        ))}
        <HistoryEntry header={historyHeader(expense.createdBy, 'added')} at={expense.createdAt} />
      </Flex>
    </>
  )
}
