import { DeleteOutlined, SwapOutlined } from '@ant-design/icons'
import { Flex, theme, Typography } from 'antd'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { CategoryIcon } from '../../../../../components/CategoryIcon'
import { useColorScheme } from '../../../../../hooks/useColorScheme'
import { ROUTES } from '../../../../../routes.ts'
import { expenseService } from '../../../../../services/expenseService'
import { groupService } from '../../../../../services/groupService'
import type { ExpenseListItem, ExpensePayer } from '../../../../../services/expenseService/types.ts'
import { moneyService } from '../../../../../services/moneyService'
import { OWED_TO_YOU_COLOR, YOU_OWE_COLOR } from '../../../../../theme/balanceColors.ts'
import { CATEGORY_GROUP_COLORS } from '../../../../../theme/categoryColors.ts'
import type { ExpensePageState } from '../../../../expense/types.ts'
import { dateParts, expenseStatus } from './utils.ts'

const { Text } = Typography

type Props = {
  expense: ExpenseListItem
  /** The group the expense is in, for the link to its details. */
  groupId: string
}

/**
 * One expense in the group's list: the date (month over day), its category
 * tile, the description with who paid under it, and on the right what it means
 * for the user ("you lent" in green, "you borrowed" in orange-red). A payment
 * and a deleted expense are one line each instead. The whole row opens the
 * expense's details.
 */
export function ExpenseRow({ expense, groupId }: Props) {
  const scheme = useColorScheme()
  const { token } = theme.useToken()
  const { month, day } = dateParts(expense.date)
  const status = expenseStatus(expense)
  const { id, description, category, amountMinor, currency, date, payer, recipient, deleted } = expense
  const person = (who: ExpensePayer) => ({ email: who.email, name: who.name, isYou: who.isYou })
  const opened: ExpensePageState = {
    expense: {
      id,
      groupId,
      description,
      category,
      amountMinor,
      currency,
      date,
      ...(payer && recipient && category === expenseService.settlementCategory ? { payer: person(payer), recipient: person(recipient) } : {}),
      ...(deleted ? { deleted: { by: person(deleted.by), at: deleted.at } } : {}),
    },
  }

  function renderDate() {
    return (
      // 48 px high: 16 px for the month and 32 px for the day, whatever the font's own line height.
      <Flex vertical align="center" justify="center" style={{ width: 32, height: 48, flex: 'none' }}>
        <Text type="secondary" style={{ fontSize: 12, lineHeight: '16px' }}>
          {month}
        </Text>
        <Text style={{ fontSize: 20, lineHeight: '32px' }}>{day}</Text>
      </Flex>
    )
  }

  // A settlement is worded by who paid whom and how much ("You paid Priya £200.00"),
  // not by its description.
  const settlement =
    expense.category === expenseService.settlementCategory && expense.payer && expense.recipient
      ? `${expenseService.settlementSentence(expense.payer, expense.recipient)} ${moneyService.format(expense.amountMinor, expense.currency)}`
      : null

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

  // A settlement and a deleted expense are one line: an icon with no tile
  // behind it, and no amount or status at the end.
  function renderLine(icon: ReactNode, label: string, color: string, text: string) {
    return (
      <>
        <Flex
          align="center"
          justify="center"
          role="img"
          aria-label={label}
          style={{ flex: 'none', width: 40, height: 40, fontSize: 24, color }}
        >
          {icon}
        </Flex>
        <Text strong style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
          {text}
        </Text>
      </>
    )
  }

  // "You deleted 'Dinner' (£9.00)", or "You deleted a payment (You paid Priya £200.00)".
  function deletedText(deleted: NonNullable<ExpenseListItem['deleted']>) {
    const who = deleted.by.isYou ? 'You' : groupService.shortName(deleted.by)
    const what = settlement ? `a payment (${settlement})` : `'${expense.description}' (${moneyService.format(expense.amountMinor, expense.currency)})`
    return `${who} deleted ${what}`
  }

  function renderExpense() {
    return (
      <>
        <CategoryIcon category={expense.category} size={40} />
        <Flex vertical style={{ flex: 1, minWidth: 0 }}>
          <Text strong style={{ overflowWrap: 'anywhere' }}>
            {expense.description}
          </Text>
          {renderPaidBy()}
        </Flex>
        <div style={{ flex: 'none', textAlign: 'end' }}>{renderStatus()}</div>
      </>
    )
  }

  function renderBody() {
    if (expense.deleted) return renderLine(<DeleteOutlined />, 'Deleted', token.colorTextTertiary, deletedText(expense.deleted))
    if (settlement) return renderLine(<SwapOutlined />, 'Settlement', CATEGORY_GROUP_COLORS.settlement, settlement)
    return renderExpense()
  }

  return (
    <div role="listitem">
      <Link
        to={ROUTES.expense(groupId, expense.id)}
        // The expense page opens with what this list knows of the row (ADR-053, ADR-054).
        state={opened}
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', color: 'inherit' }}
      >
        {renderDate()}
        {renderBody()}
      </Link>
    </div>
  )
}
