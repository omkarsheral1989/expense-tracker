import { ArrowLeftOutlined, DeleteOutlined, EditOutlined, UndoOutlined } from '@ant-design/icons'
import { App, Avatar, Button, Divider, Flex, theme, Typography } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { CategoryIcon } from '../../../../components/CategoryIcon'
import { ComingSoon } from '../../../../components/ComingSoon'
import { getDb } from '../../../../db/client.ts'
import { ROUTES } from '../../../../routes.ts'
import { dateService } from '../../../../services/dateService'
import { expenseService } from '../../../../services/expenseService'
import type { ExpenseDetails, ExpenseShareDetails } from '../../../../services/expenseService/types.ts'
import { moneyService } from '../../../../services/moneyService'
import { SPLIT_METHOD_LABELS } from './content.ts'
import { History } from './History'
import { ReceiptGallery } from './ReceiptGallery'
import { displayName, owedSentence, paidSentence } from './utils.ts'

const { Paragraph, Text, Title } = Typography

type Props = {
  expense: ExpenseDetails
  /** Names the device's photo store, which holds the receipts. */
  datasetId: string
  /** The user's person id: a deletion or restoration is saved as theirs. */
  userId: string
  /** Called after the expense was changed here (restored), so the page reads it again. */
  onChanged: () => void
}

/**
 * One expense: its category, description, amount and day, who added it, who paid and who edited it last, how
 * it was split and what each person owes, its notes and its receipt photos. Edit opens
 * the edit page (not for a payment); Delete asks first and then removes the expense or payment.
 * A deleted expense is shown read-only, with Restore in place of Edit and Delete, and who deleted it and when.
 */
export function ExpenseDetails({ expense, datasetId, userId, onChanged }: Props) {
  const navigate = useNavigate()
  const { message, modal } = App.useApp()
  const [restoring, setRestoring] = useState(false)
  const { token } = theme.useToken()
  const category = expenseService.categoryOf(expense.category)
  // A settlement is worded by who paid whom ("You paid Priya"), and has no split to show.
  const isSettlement = expense.category === expenseService.settlementCategory

  // What this is called in messages: an expense, or a payment between members.
  const noun = isSettlement ? 'payment' : 'expense'

  async function handleDelete() {
    try {
      const result = await expenseService.deleteExpense(await getDb(), userId, expense.groupId, expense.id)
      if (result.ok) message.success(`${noun === 'payment' ? 'Payment' : 'Expense'} deleted.`)
      else message.error(`This ${noun} is no longer available.`)
      navigate(ROUTES.group(expense.groupId))
    } catch {
      message.error(`Couldn't delete the ${noun}. Please try again.`)
    }
  }

  function confirmDelete() {
    modal.confirm({
      title: `Delete this ${noun}?`,
      content: 'It will be removed from the group, and the balances will change.',
      okText: 'Delete',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      // The dialog stays open, with its button busy, until this is done.
      onOk: handleDelete,
    })
  }

  async function handleRestore() {
    setRestoring(true)
    try {
      const result = await expenseService.restoreExpense(await getDb(), userId, expense.groupId, expense.id)
      if (!result.ok && 'notFound' in result) {
        message.error(`This ${noun} is no longer available.`)
        navigate(ROUTES.group(expense.groupId))
        return
      }
      if (result.ok) message.success(`${noun === 'payment' ? 'Payment' : 'Expense'} restored.`)
      else message.error(`This ${noun} was already restored.`)
      onChanged()
    } catch {
      message.error(`Couldn't restore the ${noun}. Please try again.`)
    } finally {
      setRestoring(false)
    }
  }

  // A deleted expense has Restore where a live one has Edit and Delete.
  function renderActions() {
    if (expense.deleted) {
      return (
        <Button icon={<UndoOutlined />} loading={restoring} onClick={handleRestore}>
          Restore
        </Button>
      )
    }
    return (
      <Flex gap={8}>
        {renderEditButton()}
        <Button icon={<DeleteOutlined />} aria-label="Delete" onClick={confirmDelete} />
      </Flex>
    )
  }

  // A payment between members has no edit form yet.
  function renderEditButton() {
    if (isSettlement) {
      return (
        <ComingSoon>
          <Button icon={<EditOutlined />} disabled>
            Edit
          </Button>
        </ComingSoon>
      )
    }
    return (
      <Button icon={<EditOutlined />} onClick={() => navigate(ROUTES.editExpense(expense.groupId, expense.id))}>
        Edit
      </Button>
    )
  }

  function renderHeader() {
    return (
      <Flex align="center" justify="space-between" style={{ marginBottom: 16 }}>
        <Flex align="center" gap={8} style={{ minWidth: 0 }}>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            aria-label="Back"
            onClick={() => navigate(ROUTES.group(expense.groupId))}
          />
          {expense.deleted && (
            <Title level={3} style={{ margin: 0 }}>
              Deleted {noun}
            </Title>
          )}
        </Flex>
        {renderActions()}
      </Flex>
    )
  }

  // A settlement's title already says who paid whom.
  function renderPayers() {
    if (isSettlement) return null
    return expense.shares
      .filter((share) => share.paidMinor > 0)
      .map((share) => (
        <Text key={share.personId} type="secondary">
          {paidSentence(share, expense.currency)}
        </Text>
      ))
  }

  function renderLastEdit() {
    if (!expense.lastEdit) return null
    const { by, at } = expense.lastEdit
    return (
      <Text type="secondary">
        Edited by {by.isYou ? 'you' : displayName(by)}, {dateService.formatDateTime(at, navigator.language)}
      </Text>
    )
  }

  function renderDeleted() {
    if (!expense.deleted) return null
    const { by, at } = expense.deleted
    return (
      <Text type="secondary">
        Deleted by {by.isYou ? 'you' : displayName(by)}, {dateService.formatDateTime(at, navigator.language)}
      </Text>
    )
  }

  function renderSummary() {
    return (
      <Flex align="flex-start" gap={16}>
        <CategoryIcon category={expense.category} size={48} />
        <Flex vertical style={{ minWidth: 0 }}>
          <Title level={3} style={{ margin: 0, overflowWrap: 'anywhere' }}>
            {expenseService.titleOf(expense)}
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
          {renderPayers()}
          {renderLastEdit()}
          {renderDeleted()}
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
        <Text style={{ overflowWrap: 'anywhere' }}>{owedSentence(share, expense.currency)}</Text>
      </Flex>
    )
  }

  function renderSplit() {
    if (isSettlement) return null
    return (
      <>
        <Divider style={{ margin: '16px 0' }} />
        <Text strong>{SPLIT_METHOD_LABELS[expense.method]}</Text>
        <Flex vertical gap={12} role="list" aria-label="Who owes" style={{ marginTop: 12 }}>
          {expense.shares.filter((share) => share.owedMinor > 0).map(renderShare)}
        </Flex>
      </>
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

  function renderReceipts() {
    if (expense.receipts.length === 0) return null
    return (
      <>
        <Divider style={{ margin: '16px 0' }} />
        <Text strong style={{ display: 'block', marginBottom: 8 }}>
          Receipts
        </Text>
        <ReceiptGallery receipts={expense.receipts} datasetId={datasetId} />
      </>
    )
  }

  return (
    <>
      {renderHeader()}
      {renderSummary()}
      {renderSplit()}
      {renderNotes()}
      {renderReceipts()}
      <History expense={expense} />
    </>
  )
}
