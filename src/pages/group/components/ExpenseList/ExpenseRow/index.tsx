import { DeleteOutlined, SwapOutlined } from '@ant-design/icons'
import { Flex, theme, Typography } from 'antd'
import type { ReactNode } from 'react'
import { AppLink } from '../../../../../components/AppLink'
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
  /** The user is the group's only member, so nobody can owe anybody: the right side shows the amount instead of a balance. */
  soloGroup?: boolean
}

/**
 * One expense in the group's list: the date (month over day), its category
 * tile, the description with who paid under it, and on the right what it means
 * for the user ("you lent" in green, "you borrowed" in orange-red). A payment
 * and a deleted expense are one line each instead. The whole row opens the
 * expense's details.
 */
export function ExpenseRow({ expense, groupId, soloGroup = false }: Props) {
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
  const settlementSentence =
    expense.category === expenseService.settlementCategory && expense.payer && expense.recipient
      ? expenseService.settlementSentence(expense.payer, expense.recipient)
      : null
  const amount = moneyService.format(expense.amountMinor, expense.currency)
  const settlement = settlementSentence ? `${settlementSentence} ${amount}` : null

  /** The amount alone, a piece that grows into the large amount of the expense's band (PRD 5.16). */
  const travellingAmount = (
    <span data-vt="amount" style={{ display: 'inline-block' }}>
      {amount}
    </span>
  )

  function renderPaidBy() {
    if (!expense.payer) return null
    const who = expense.payer.isYou ? 'You' : groupService.shortName(expense.payer)
    return (
      <Text type="secondary" style={{ fontSize: 13 }}>
        {who} paid {travellingAmount}
      </Text>
    )
  }

  function renderStatus() {
    if (soloGroup) return <strong>{moneyService.format(amountMinor, currency)}</strong>
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
  // A payment's icon and amount travel into the band of its page like an expense's tile and amount (PRD 5.16); a deleted line's do not.
  function renderLine(icon: ReactNode, label: string, color: string, text: ReactNode, travels = false) {
    return (
      <>
        <Flex
          align="center"
          justify="center"
          role="img"
          aria-label={label}
          data-vt={travels ? 'block' : undefined}
          style={{ flex: 'none', width: 40, height: 40, fontSize: 24, color }}
        >
          {travels ? (
            <span data-vt="icon" style={{ display: 'flex' }}>
              {icon}
            </span>
          ) : (
            icon
          )}
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
        <CategoryIcon category={expense.category} size={40} travels />
        <Flex vertical style={{ flex: 1, minWidth: 0 }}>
          <Text strong data-vt="name" style={{ overflowWrap: 'anywhere', width: 'fit-content', maxWidth: '100%' }}>
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
    if (settlementSentence) {
      const sentence = (
        <>
          {settlementSentence} {travellingAmount}
        </>
      )
      return renderLine(<SwapOutlined />, 'Settlement', CATEGORY_GROUP_COLORS.settlement, sentence, true)
    }
    return renderExpense()
  }

  return (
    <div role="listitem">
      <AppLink
        to={ROUTES.expense(groupId, expense.id)}
        // The expense page opens with what this list knows of the row (ADR-053, ADR-054).
        state={opened}
        // Its pieces travel into the band of the expense's page when it opens (PRD 5.16); a deleted line keeps the plain slide.
        data-expense-row={expense.deleted ? undefined : expense.id}
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', color: 'inherit' }}
      >
        {renderDate()}
        {renderBody()}
      </AppLink>
    </div>
  )
}
