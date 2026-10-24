import { ArrowLeftOutlined, CalendarOutlined } from '@ant-design/icons'
import { Flex, Typography } from 'antd'
import type { ReactNode } from 'react'
import { BandChip } from '../../../../../components/BandChip'
import { BandIconButton } from '../../../../../components/BandIconButton'
import { CATEGORY_ICONS } from '../../../../../components/CategoryIcon/content.tsx'
import { ROUTES } from '../../../../../routes.ts'
import { dateService } from '../../../../../services/dateService'
import { expenseService } from '../../../../../services/expenseService'
import type { ExpenseDetails } from '../../../../../services/expenseService/types.ts'
import { moneyService } from '../../../../../services/moneyService'
import { bandBackground } from '../../../../../theme/bandBackground.ts'
import { CATEGORY_GROUP_COLORS } from '../../../../../theme/categoryColors.ts'
import { HEADER_TITLE_STYLE } from '../../../../../theme/headerTitle.ts'
import { BAND_BOTTOM_PADDING, belowStatusBar, HEADER_TOP_PADDING } from '../../../../../theme/safeArea.ts'
import { useAppNavigate } from '../../../../../hooks/useAppNavigate'
import { TEXT_SHADOW } from './style.ts'

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
  /** Opens the edit page when the date or category chip is pressed; left out when the expense cannot be edited (a payment, a deleted expense, one still loading). */
  onEdit?: () => void
}

/**
 * The colored band at the top of an expense's page, in the color of its
 * category's group: back and the page's buttons, then the category's icon, the
 * amount and the description in white, and the day and category as chips. Who
 * paid, who added it and who deleted it are below it and in the history.
 */
export function ExpenseBand({ expense, title, actions, onEdit }: Props) {
  const navigate = useAppNavigate()
  const category = expenseService.categoryOf(expense.category)
  const isSettlement = expense.category === expenseService.settlementCategory

  function renderHeader() {
    return (
      <Flex align="center" justify="space-between">
        <Flex align="center" gap={8} style={{ minWidth: 0 }}>
          <BandIconButton icon={<ArrowLeftOutlined />} label="Back" onClick={() => navigate(ROUTES.group(expense.groupId), { direction: 'back' })} />
          {/* Still a heading, but quieter than the expense's own title below it. */}
          <Title level={3} style={{ ...HEADER_TITLE_STYLE, color: '#fff' }}>
            {title}
          </Title>
        </Flex>
        <Flex gap={12}>{actions}</Flex>
      </Flex>
    )
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
          {/* A payment is worded by who paid whom, in a row below the band, so it has no title here. */}
          {isSettlement ? null : (
            <Title level={3} style={{ margin: 0, color: '#fff', overflowWrap: 'anywhere', textShadow: TEXT_SHADOW }}>
              {expense.description}
            </Title>
          )}
        </Flex>
      </Flex>
    )
  }

  // The day and the category, as chips like the group page's.
  function renderChips() {
    return (
      <Flex wrap gap={8}>
        <BandChip icon={<CalendarOutlined />} onClick={onEdit}>{dateService.formatDay(expense.date, dateService.toDay(new Date()))}</BandChip>
        <BandChip icon={CATEGORY_ICONS[category.key]} onClick={onEdit}>
          {category.label === 'Other' ? `${category.groupLabel}: Other` : category.label}
        </BandChip>
      </Flex>
    )
  }

  return (
    <div style={{ padding: `${belowStatusBar(HEADER_TOP_PADDING)} 16px ${BAND_BOTTOM_PADDING}px`, background: bandBackground(CATEGORY_GROUP_COLORS[category.group]) }}>
      <Flex vertical gap={20} style={{ maxWidth: 560, margin: '0 auto' }}>
        {renderHeader()}
        {renderSummary()}
        {renderChips()}
      </Flex>
    </div>
  )
}
