import { ArrowLeftOutlined } from '@ant-design/icons'
import { Flex, Typography } from 'antd'
import type { ReactNode } from 'react'
import { BandIconButton } from '../../../../../components/BandIconButton'
import { CATEGORY_ICONS } from '../../../../../components/CategoryIcon/content.tsx'
import { paidSentence } from '../../../../../components/ExpenseWording'
import { ROUTES } from '../../../../../routes.ts'
import { dateService } from '../../../../../services/dateService'
import { expenseService } from '../../../../../services/expenseService'
import type { ExpenseDetails } from '../../../../../services/expenseService/types.ts'
import { moneyService } from '../../../../../services/moneyService'
import { bandBackground } from '../../../../../theme/bandBackground.ts'
import { CATEGORY_GROUP_COLORS } from '../../../../../theme/categoryColors.ts'
import { HEADER_TITLE_STYLE } from '../../../../../theme/headerTitle.ts'
import { belowStatusBar, HEADER_TOP_PADDING } from '../../../../../theme/safeArea.ts'
import { useNavigate } from 'react-router'
import { SOFT_WHITE, TEXT_SHADOW } from './style.ts'

const { Text, Title } = Typography

/**
 * What the band needs of an expense. The shares (who paid) come with the full
 * expense; an expense known from the list has none yet, and is never a payment.
 */
export type BandExpense = Pick<ExpenseDetails, 'groupId' | 'description' | 'category' | 'amountMinor' | 'currency' | 'date'> &
  Partial<Pick<ExpenseDetails, 'shares'>>

type Props = {
  expense: BandExpense
  /** What the page is called in the header: "Expense", "Payment", "Deleted expense" … */
  title: string
  /** The buttons at the right of the header (Edit and Delete, or Restore). */
  actions: ReactNode
  /** Lines under the category and day, before who paid ("Added by you"). */
  before: ReactNode
  /** What to call the expense instead of its description: a payment's "You paid Priya", for a payment known from the list (no shares yet). */
  headline?: string
  /** Lines after who paid ("Edited by …", "Deleted by …"). */
  after: ReactNode
}

/**
 * The colored band at the top of an expense's page, in the color of its
 * category's group: back and the page's buttons, then the category's icon, the
 * description, the amount, the category and day, and who added and paid for it,
 * all in white.
 */
export function ExpenseBand({ expense, title, actions, before, after, headline }: Props) {
  const navigate = useNavigate()
  const category = expenseService.categoryOf(expense.category)
  // A settlement is worded by who paid whom ("You paid Priya"), and has no payer line.
  const isSettlement = expense.category === expenseService.settlementCategory

  function renderHeader() {
    return (
      <Flex align="center" justify="space-between">
        <Flex align="center" gap={8} style={{ minWidth: 0 }}>
          <BandIconButton icon={<ArrowLeftOutlined />} label="Back" onClick={() => navigate(ROUTES.group(expense.groupId))} />
          {/* Still a heading, but quieter than the expense's own title below it. */}
          <Title level={3} style={{ ...HEADER_TITLE_STYLE, color: '#fff' }}>
            {title}
          </Title>
        </Flex>
        <Flex gap={12}>{actions}</Flex>
      </Flex>
    )
  }

  function renderPayers() {
    if (isSettlement) return null
    return (expense.shares ?? [])
      .filter((share) => share.paidMinor > 0)
      .map((share) => (
        <Text key={share.personId} style={{ color: SOFT_WHITE }}>
          {paidSentence(share, expense.currency)}
        </Text>
      ))
  }

  function renderSummary() {
    return (
      <Flex align="flex-start" gap={16}>
        <span
          role="img"
          aria-label={category.label === 'Other' ? `${category.groupLabel}: Other` : category.label}
          // The category's icon alone, 40 px and white on the band, beside the description.
          style={{ display: 'flex', flex: 'none', fontSize: 40, lineHeight: '40px', color: '#fff', filter: 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.35))' }}
        >
          {CATEGORY_ICONS[category.key]}
        </span>
        <Flex vertical style={{ minWidth: 0 }}>
          {/* A 40 px line, the height of the icon beside it, so the two line up. */}
          <Text style={{ fontSize: 28, fontWeight: 600, lineHeight: '40px', color: '#fff', textShadow: TEXT_SHADOW }}>
            {moneyService.format(expense.amountMinor, expense.currency)}
          </Text>
          <Title level={3} style={{ margin: 0, color: '#fff', overflowWrap: 'anywhere', textShadow: TEXT_SHADOW }}>
            {headline ?? (expense.shares ? expenseService.titleOf({ ...expense, shares: expense.shares }) : expense.description)}
          </Title>
          <Text style={{ color: SOFT_WHITE }}>
            {category.label === 'Other' ? `${category.groupLabel}: Other` : category.label} ·{' '}
            {dateService.formatDay(expense.date, dateService.toDay(new Date()))}
          </Text>
          {before}
          {renderPayers()}
          {after}
        </Flex>
      </Flex>
    )
  }

  return (
    <div style={{ padding: `${belowStatusBar(HEADER_TOP_PADDING)} 16px 24px`, background: bandBackground(CATEGORY_GROUP_COLORS[category.group]) }}>
      <Flex vertical gap={20} style={{ maxWidth: 560, margin: '0 auto' }}>
        {renderHeader()}
        {renderSummary()}
      </Flex>
    </div>
  )
}
