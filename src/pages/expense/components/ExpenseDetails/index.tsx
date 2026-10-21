import { DeleteOutlined, EditOutlined, UndoOutlined } from '@ant-design/icons'
import { App, Button, Flex, Typography } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ComingSoon } from '../../../../components/ComingSoon'
import { ExpenseBody } from '../../../../components/ExpenseBody'
import { displayName } from '../../../../components/ExpenseWording'
import { getDb } from '../../../../db/client.ts'
import { ROUTES } from '../../../../routes.ts'
import { dateService } from '../../../../services/dateService'
import { expenseService } from '../../../../services/expenseService'
import type { ExpenseDetails } from '../../../../services/expenseService/types.ts'
import { History } from './History'
import { HEADER_TITLE_STYLE } from '../../../../theme/headerTitle.ts'
import { BackButton } from '../../../../components/BackButton'

const { Text, Title } = Typography

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
          <BackButton onClick={() => navigate(ROUTES.group(expense.groupId))} />
          {/* Still a heading, but quieter than the expense's own title below it. */}
          <Title level={3} style={HEADER_TITLE_STYLE}>
            {expense.deleted ? `Deleted ${noun}` : noun === 'payment' ? 'Payment' : 'Expense'}
          </Title>
        </Flex>
        {renderActions()}
      </Flex>
    )
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

  return (
    <>
      {renderHeader()}
      <ExpenseBody
        description={expense.description}
        category={expense.category}
        amountMinor={expense.amountMinor}
        currency={expense.currency}
        date={expense.date}
        notes={expense.notes}
        method={expense.method}
        shares={expense.shares}
        receipts={expense.receipts}
        datasetId={datasetId}
        before={<Text type="secondary">Added by {expense.createdBy.isYou ? 'you' : displayName(expense.createdBy)}</Text>}
        after={
          <>
            {renderLastEdit()}
            {renderDeleted()}
          </>
        }
      />
      <History expense={expense} />
    </>
  )
}
