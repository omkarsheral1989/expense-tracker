import { Divider, Flex, Typography } from 'antd'
import { expenseService } from '../../../../../services/expenseService'
import type { ExpenseDetails } from '../../../../../services/expenseService/types.ts'
import { historyHeader, historyLines } from '../../../../../components/ExpenseWording'
import { HistoryEntry } from '../../../../../components/HistoryEntry'
import { ROUTES } from '../../../../../routes.ts'

const { Text } = Typography

type Props = {
  expense: ExpenseDetails
}

/**
 * Everything that happened to an expense, newest first, as the events record it
 * (ADR-042): each edit with what it changed, that it was deleted or restored,
 * and last that it was added. Shown only once something besides adding it has
 * happened.
 */
export function History({ expense }: Props) {
  if (expense.history.every((entry) => entry.kind === 'added')) return null
  const noun = expense.category === expenseService.settlementCategory ? 'payment' : 'expense'

  return (
    <>
      <Divider style={{ margin: '16px 0' }} />
      <Text strong style={{ display: 'block', marginBottom: 12 }}>
        History
      </Text>
      <Flex vertical gap={16} role="list" aria-label="History">
        {expense.history.map((entry, index) => (
          <HistoryEntry
            key={index}
            header={historyHeader(entry.by, entry.kind, noun, entry.restoredFromAt)}
            at={entry.at}
            lines={historyLines(entry, expense.people)}
            to={ROUTES.expenseVersion(expense.groupId, expense.id, entry.id)}
          />
        ))}
      </Flex>
    </>
  )
}
