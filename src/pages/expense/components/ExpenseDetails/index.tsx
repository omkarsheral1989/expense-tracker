import { DeleteOutlined, EditOutlined, UndoOutlined } from '@ant-design/icons'
import { App, Flex, Typography } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { BandIconButton } from '../../../../components/BandIconButton'
import { ExpenseBody } from '../../../../components/ExpenseBody'
import { displayName } from '../../../../components/ExpenseWording'
import { getDb } from '../../../../db/client.ts'
import { ROUTES } from '../../../../routes.ts'
import { dateService } from '../../../../services/dateService'
import { expenseService } from '../../../../services/expenseService'
import type { ExpenseDetails } from '../../../../services/expenseService/types.ts'
import { aboveScreenEdge } from '../../../../theme/safeArea.ts'
import { ExpenseBand } from './ExpenseBand'
import { SOFT_WHITE } from './ExpenseBand/style.ts'
import { History } from './History'

const { Text } = Typography

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
      return <BandIconButton icon={<UndoOutlined />} label="Restore" loading={restoring} onClick={handleRestore} />
    }
    return (
      <>
        {/* A payment between members has no edit form yet, so its button is switched off. */}
        <BandIconButton
          icon={<EditOutlined />}
          label="Edit"
          onClick={isSettlement ? undefined : () => navigate(ROUTES.editExpense(expense.groupId, expense.id))}
        />
        <BandIconButton icon={<DeleteOutlined />} label="Delete" onClick={confirmDelete} />
      </>
    )
  }

  function renderTitle() {
    if (expense.deleted) return `Deleted ${noun}`
    return noun === 'payment' ? 'Payment' : 'Expense'
  }

  function renderLastEdit() {
    if (!expense.lastEdit) return null
    const { by, at } = expense.lastEdit
    return (
      <Text style={{ color: SOFT_WHITE }}>
        Edited by {by.isYou ? 'you' : displayName(by)}, {dateService.formatDateTime(at, navigator.language)}
      </Text>
    )
  }

  function renderDeleted() {
    if (!expense.deleted) return null
    const { by, at } = expense.deleted
    return (
      <Text style={{ color: SOFT_WHITE }}>
        Deleted by {by.isYou ? 'you' : displayName(by)}, {dateService.formatDateTime(at, navigator.language)}
      </Text>
    )
  }

  return (
    <>
      <ExpenseBand
        expense={expense}
        title={renderTitle()}
        actions={renderActions()}
        before={<Text style={{ color: SOFT_WHITE }}>Added by {expense.createdBy.isYou ? 'you' : displayName(expense.createdBy)}</Text>}
        after={
          <>
            {renderLastEdit()}
            {renderDeleted()}
          </>
        }
      />
      {/* Below the band, in a column about 560 px wide. */}
      <Flex vertical style={{ width: '100%', maxWidth: 560, margin: '0 auto', padding: `24px 16px ${aboveScreenEdge(24)}` }}>
        <ExpenseBody
          withoutSummary
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
        />
        <History expense={expense} />
      </Flex>
    </>
  )
}
