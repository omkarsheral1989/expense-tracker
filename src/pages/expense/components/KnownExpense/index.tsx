import { DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { Flex } from 'antd'
import { BandIconButton } from '../../../../components/BandIconButton'
import { LoadingMessage } from '../../../../components/LoadingMessage'
import { aboveScreenEdge } from '../../../../theme/safeArea.ts'
import type { KnownExpense } from '../../types.ts'
import { ExpenseBand } from '../ExpenseDetails/ExpenseBand'

type Props = {
  expense: KnownExpense
}

/**
 * An expense's page while the rest of it loads (ADR-053): the colored band with
 * its category, amount, description and day, which the group's list already
 * knew, and a spinner below it for the split, notes, receipts and history.
 * Edit and Delete are switched off until the expense is read, since whether it
 * was deleted meanwhile is not known; Back works.
 */
export function KnownExpensePage({ expense }: Props) {
  return (
    <Flex vertical style={{ flex: 1 }}>
      <ExpenseBand
        expense={expense}
        title="Expense"
        actions={
          <>
            <BandIconButton icon={<EditOutlined />} label="Edit" disabled />
            <BandIconButton icon={<DeleteOutlined />} label="Delete" disabled />
          </>
        }
        before={null}
        after={null}
      />
      <Flex vertical style={{ flex: 1, width: '100%', maxWidth: 560, margin: '0 auto', padding: `0 16px ${aboveScreenEdge(24)}` }}>
        <LoadingMessage label="Loading the expense" />
      </Flex>
    </Flex>
  )
}
