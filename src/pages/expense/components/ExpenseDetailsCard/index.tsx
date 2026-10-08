import { ArrowLeftOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { Avatar, Button, Card, Divider, Flex, theme, Typography } from 'antd'
import { useNavigate } from 'react-router'
import { CategoryIcon } from '../../../../components/CategoryIcon'
import { ComingSoon } from '../../../../components/ComingSoon'
import { ROUTES } from '../../../../routes.ts'
import { dateService } from '../../../../services/dateService'
import { expenseService } from '../../../../services/expenseService'
import type { ExpenseDetails, ExpenseShareDetails } from '../../../../services/expenseService/types.ts'
import { moneyService } from '../../../../services/moneyService'
import { SPLIT_METHOD_LABELS } from './content.ts'
import { displayName, shareSentence } from './utils.ts'

const { Paragraph, Text, Title } = Typography

type Props = {
  expense: ExpenseDetails
}

/**
 * One expense: its category, description, amount and day, who added it, how
 * it was split and each person's part, and its notes. Editing and deleting are
 * shown switched off ("Coming soon").
 */
export function ExpenseDetailsCard({ expense }: Props) {
  const navigate = useNavigate()
  const { token } = theme.useToken()
  const category = expenseService.categoryOf(expense.category)

  function renderHeader() {
    return (
      <Flex align="center" justify="space-between" style={{ marginBottom: 16 }}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          aria-label="Back"
          onClick={() => navigate(ROUTES.group(expense.groupId))}
        />
        <Flex gap={8}>
          <ComingSoon>
            <Button icon={<EditOutlined />} disabled>
              Edit
            </Button>
          </ComingSoon>
          <ComingSoon>
            <Button icon={<DeleteOutlined />} aria-label="Delete" disabled />
          </ComingSoon>
        </Flex>
      </Flex>
    )
  }

  function renderSummary() {
    return (
      <Flex align="flex-start" gap={16}>
        <CategoryIcon category={expense.category} size={56} />
        <Flex vertical style={{ minWidth: 0 }}>
          <Title level={3} style={{ margin: 0, overflowWrap: 'anywhere' }}>
            {expense.description}
          </Title>
          <Text style={{ fontSize: 28, fontWeight: 600 }}>
            {moneyService.format(expense.amountMinor, expense.currency)}
          </Text>
          <Text type="secondary">
            {category.label === 'Other' ? `${category.groupLabel}: Other` : category.label} ·{' '}
            {dateService.formatDay(expense.date, dateService.toDay(new Date()))}
          </Text>
          <Text type="secondary">
            Added by {expense.createdBy.isYou ? 'you' : displayName(expense.createdBy)}
          </Text>
        </Flex>
      </Flex>
    )
  }

  function renderShare(share: ExpenseShareDetails) {
    const name = displayName(share)
    return (
      <Flex key={share.personId} align="center" gap={12} role="listitem">
        <Avatar style={{ flex: 'none', background: token.colorPrimaryBg, color: token.colorPrimary }}>
          {name.charAt(0).toUpperCase()}
        </Avatar>
        <Text style={{ overflowWrap: 'anywhere' }}>{shareSentence(share, expense.currency)}</Text>
      </Flex>
    )
  }

  function renderNotes() {
    if (!expense.notes) return null
    return (
      <>
        <Divider style={{ margin: '16px 0' }} />
        <Text strong>Notes</Text>
        <Paragraph style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0', overflowWrap: 'anywhere' }}>
          {expense.notes}
        </Paragraph>
      </>
    )
  }

  return (
    <Card>
      {renderHeader()}
      {renderSummary()}
      <Divider style={{ margin: '16px 0' }} />
      <Text strong>{SPLIT_METHOD_LABELS[expense.method]}</Text>
      <Flex vertical gap={12} role="list" aria-label="Who paid and owes" style={{ marginTop: 12 }}>
        {expense.shares.map(renderShare)}
      </Flex>
      {renderNotes()}
    </Card>
  )
}
