import { DeleteOutlined, EditOutlined, UndoOutlined } from '@ant-design/icons'
import { Flex } from 'antd'
import { BandIconButton } from '../../../../components/BandIconButton'
import { LoadingMessage } from '../../../../components/LoadingMessage'
import { expenseService } from '../../../../services/expenseService'
import { groupService } from '../../../../services/groupService'
import { aboveScreenEdge, UNDER_BAND_PADDING } from '../../../../theme/safeArea.ts'
import type { KnownExpense } from '../../types.ts'
import { knownTitle } from '../../utils.ts'
import { PaymentRow, type PaymentSide } from '../PaymentRow'
import { ExpenseBand } from '../ExpenseDetails/ExpenseBand'

type Props = {
  expense: KnownExpense
}

/**
 * An expense's page while the rest of it loads (ADR-053, ADR-054): the colored
 * band with what the group's list already knew, and a spinner below it for the
 * rest. Its buttons are switched off until the expense is read, since it may
 * have been deleted or restored meanwhile; Back works. A payment is worded by
 * who paid whom, and a deleted expense says who deleted it and when, with
 * Restore in place of Edit and Delete, as on the full page.
 */
export function KnownExpensePage({ expense }: Props) {
  const noun = expense.category === expenseService.settlementCategory ? 'payment' : 'expense'

  function renderTitle() {
    if (expense.deleted) return `Deleted ${noun}`
    return noun === 'payment' ? 'Payment' : 'Expense'
  }

  function renderActions() {
    if (expense.deleted) return <BandIconButton icon={<UndoOutlined />} label="Restore" disabled />
    return (
      <>
        <BandIconButton icon={<EditOutlined />} label="Edit" disabled />
        <BandIconButton icon={<DeleteOutlined />} label="Delete" disabled />
      </>
    )
  }

  function sideOf(person: NonNullable<KnownExpense['payer']>): PaymentSide {
    return { name: person.isYou ? 'You' : groupService.shortName(person) }
  }

  // A payment shows who paid whom below the band at once, as the full page does.
  function renderPayment() {
    if (!expense.payer || !expense.recipient) return null
    return <PaymentRow payer={sideOf(expense.payer)} recipient={sideOf(expense.recipient)} label={knownTitle(expense)} />
  }

  return (
    <Flex vertical style={{ flex: 1 }}>
      <ExpenseBand
        expense={expense}
        title={renderTitle()}
        actions={renderActions()}
      />
      <Flex vertical style={{ flex: 1, width: '100%', maxWidth: 560, margin: '0 auto', padding: `${UNDER_BAND_PADDING}px 16px ${aboveScreenEdge(24)}` }}>
        {renderPayment()}
        <LoadingMessage label="Loading the expense" />
      </Flex>
    </Flex>
  )
}
