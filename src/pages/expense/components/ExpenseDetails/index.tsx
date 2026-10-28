import { Icon } from '../../../../components/Icon'
import { useQueryClient } from '@tanstack/react-query'
import { App, Flex } from 'antd'
import { refreshGroupPage } from '../../../group/utils.ts'
import { useState } from 'react'
import { useAppNavigate } from '../../../../hooks/useAppNavigate'
import { BandIconButton } from '../../../../components/BandIconButton'
import { ExpenseBody } from '../../../../components/ExpenseBody'
import { getDb } from '../../../../db/client.ts'
import { ROUTES } from '../../../../routes.ts'
import { expenseService } from '../../../../services/expenseService'
import { groupService } from '../../../../services/groupService'
import type { ExpenseWithPayment } from '../../types.ts'
import { aboveScreenEdge, UNDER_BAND_PADDING } from '../../../../theme/safeArea.ts'
import { PaymentRow } from '../PaymentRow'
import { ExpenseBand } from './ExpenseBand'
import { History } from './History'
import { dialogLayer } from '../../../../components/DialogLayer'
import { useConfirm } from '../../../../hooks/useConfirm'

type Props = {
  expense: ExpenseWithPayment
  /** Names the device's photo store, which holds the receipts. */
  datasetId: string
  /** The user's person id: a deletion or restoration is saved as theirs. */
  userId: string
  /** Called after the expense was changed here (restored), so the page reads it again. */
  onChanged: () => void
}

/**
 * One expense: its category, description, amount and day, who paid, how
 * it was split and what each person owes, its notes, its receipt photos and its history. Edit opens
 * the edit page (not for a payment); Delete asks first and then removes the expense or payment.
 * A deleted expense is shown read-only, with Restore in place of Edit and Delete; its history says who deleted it and when.
 */
export function ExpenseDetails({ expense, datasetId, userId, onChanged }: Props) {
  const navigate = useAppNavigate()
  const queryClient = useQueryClient()
  const { message } = App.useApp()
  const confirm = useConfirm()
  const [restoring, setRestoring] = useState(false)
  // A settlement is worded by who paid whom ("You paid Priya"), and has no split to show.
  const isSettlement = expense.category === expenseService.settlementCategory

  // What this is called in messages: an expense, or a payment between members.
  const noun = isSettlement ? 'payment' : 'expense'

  async function handleDelete() {
    try {
      const result = await expenseService.deleteExpense(await getDb(), userId, expense.groupId, expense.id)
      // The group page comes back with the deletion already on it, without its loader.
      await refreshGroupPage(queryClient, userId, expense.groupId)
      if (result.ok) message.success(`${noun === 'payment' ? 'Payment' : 'Expense'} deleted.`)
      else message.error(`This ${noun} is no longer available.`)
      navigate(ROUTES.group(expense.groupId), { direction: 'back' })
    } catch {
      message.error(`Couldn't delete the ${noun}. Please try again.`)
    }
  }

  function confirmDelete() {
    confirm({
      // In the layer that stays in front while the page changes after it (`dialogLayer`).
      getContainer: dialogLayer,
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
        navigate(ROUTES.group(expense.groupId), { direction: 'back' })
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
      return <BandIconButton icon={<Icon name="undo" />} label="Restore" loading={restoring} onClick={handleRestore} />
    }
    return (
      <>
        {/* A payment between members has no edit form yet, so its button is switched off. */}
        <BandIconButton
          icon={<Icon name="pencil" />}
          label="Edit"
          onClick={isSettlement ? undefined : () => navigate(ROUTES.editExpense(expense.groupId, expense.id))}
        />
        <BandIconButton icon={<Icon name="trash" />} label="Delete" onClick={confirmDelete} />
      </>
    )
  }

  function renderTitle() {
    if (expense.deleted) return `Deleted ${noun}`
    return noun === 'payment' ? 'Payment' : 'Expense'
  }

  // A payment is worded by who paid whom, in a row below the band.
  function renderPayment() {
    if (!isSettlement) return null
    const payer = expense.shares.find((share) => share.paidMinor > 0)
    const recipient = expense.shares.find((share) => share.owedMinor > 0)
    if (!payer || !recipient) return null
    return (
      <PaymentRow
        payer={{ name: payer.isYou ? 'You' : groupService.shortName(payer), picture: payer.picture }}
        recipient={{ name: recipient.isYou ? 'You' : groupService.shortName(recipient), picture: recipient.picture }}
        label={expenseService.titleOf(expense)}
      />
    )
  }

  return (
    <>
      <ExpenseBand
        expense={expense}
        title={renderTitle()}
        actions={renderActions()}
        onEdit={expense.deleted || isSettlement ? undefined : () => navigate(ROUTES.editExpense(expense.groupId, expense.id))}
        travels={!expense.deleted}
      />
      {/* Below the band, in a column about 560 px wide. */}
      <Flex vertical style={{ width: '100%', maxWidth: 560, margin: '0 auto', padding: `${UNDER_BAND_PADDING}px 16px ${aboveScreenEdge(24)}` }}>
        {renderPayment()}
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
          paymentMethod={expense.paymentMethod}
          receipts={expense.receipts}
          datasetId={datasetId}
        />
        <History expense={expense} />
      </Flex>
    </>
  )
}
