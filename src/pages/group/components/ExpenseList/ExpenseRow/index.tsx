import { Flex, Typography } from 'antd'
import { CategoryIcon } from '../../../../../components/CategoryIcon'
import { useColorScheme } from '../../../../../hooks/useColorScheme'
import { groupService } from '../../../../../services/groupService'
import type { ExpenseListItem } from '../../../../../services/expenseService/types.ts'
import { moneyService } from '../../../../../services/moneyService'
import { OWED_TO_YOU_COLOR, YOU_OWE_COLOR } from '../../../../../theme/balanceColors.ts'
import { dateParts, expenseStatus } from './utils.ts'

const { Text } = Typography

type Props = {
  expense: ExpenseListItem
}

/**
 * One expense in the group's list: the date (month over day), its category
 * tile, the description with who paid under it, and on the right what it means
 * for the user ("you lent" in green, "you borrowed" in orange-red).
 */
export function ExpenseRow({ expense }: Props) {
  const scheme = useColorScheme()
  const { month, day } = dateParts(expense.date)
  const status = expenseStatus(expense)

  function renderDate() {
    return (
      <Flex vertical align="center" style={{ width: 32, flex: 'none', lineHeight: 1.1 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {month}
        </Text>
        <Text style={{ fontSize: 20 }}>{day}</Text>
      </Flex>
    )
  }

  function renderPaidBy() {
    if (!expense.payer) return null
    const who = expense.payer.isYou ? 'You' : groupService.shortName(expense.payer)
    return (
      <Text type="secondary" style={{ fontSize: 13 }}>
        {who} paid {moneyService.format(expense.amountMinor, expense.currency)}
      </Text>
    )
  }

  function renderStatus() {
    if (status.kind === 'notInvolved' || status.kind === 'even') {
      return (
        <Text type="secondary" style={{ fontSize: 13 }}>
          {status.kind === 'even' ? 'no balance' : 'not involved'}
        </Text>
      )
    }
    const color = status.kind === 'lent' ? OWED_TO_YOU_COLOR[scheme] : YOU_OWE_COLOR[scheme]
    return (
      <Flex vertical align="flex-end" style={{ color }}>
        <span style={{ fontSize: 12 }}>{status.kind === 'lent' ? 'you lent' : 'you borrowed'}</span>
        <strong>{moneyService.format(status.amountMinor, expense.currency)}</strong>
      </Flex>
    )
  }

  return (
    <Flex align="center" gap={12} style={{ padding: '10px 0' }} role="listitem">
      {renderDate()}
      <CategoryIcon category={expense.category} size={40} />
      <Flex vertical style={{ flex: 1, minWidth: 0 }}>
        <Text strong style={{ overflowWrap: 'anywhere' }}>
          {expense.description}
        </Text>
        {renderPaidBy()}
      </Flex>
      <div style={{ flex: 'none', textAlign: 'end' }}>{renderStatus()}</div>
    </Flex>
  )
}
