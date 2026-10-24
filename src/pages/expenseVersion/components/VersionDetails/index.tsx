import { UndoOutlined } from '@ant-design/icons'
import { App, Button, Divider, Flex, Typography } from 'antd'
import { useState } from 'react'
import { useAppNavigate } from '../../../../hooks/useAppNavigate'
import { ExpenseBody } from '../../../../components/ExpenseBody'
import { historyHeader, historyLines } from '../../../../components/ExpenseWording'
import { HistoryEntry } from '../../../../components/HistoryEntry'
import { getDb } from '../../../../db/client.ts'
import { ROUTES } from '../../../../routes.ts'
import { dateService } from '../../../../services/dateService'
import { expenseService } from '../../../../services/expenseService'
import type { ExpenseVersion } from '../../../../services/expenseService/types.ts'
import { HEADER_TITLE_STYLE } from '../../../../theme/headerTitle.ts'
import { BackButton } from '../../../../components/BackButton'
import { PILL_RADIUS } from '../../../../theme/radius.ts'

const { Text, Title } = Typography

type Props = {
  data: ExpenseVersion
  /** Names the device's photo store, which holds the receipts. */
  datasetId: string
  /** The user's person id: going back to a version is saved as theirs. */
  userId: string
  /** Called after the page's data went out of date (the expense changed), so it reads it again. */
  onChanged: () => void
}

/**
 * One version of an expense: what happened (the event, with what it changed),
 * and the expense as it was right after it. "Restore this version" puts the
 * expense back to it, unless it already is the current version, the expense is
 * deleted (it must be restored first) or it is a payment.
 */
export function VersionDetails({ data, datasetId, userId, onChanged }: Props) {
  const navigate = useAppNavigate()
  const { message } = App.useApp()
  const [restoring, setRestoring] = useState(false)
  const { event, version } = data
  const noun = data.isPayment ? 'payment' : 'expense'
  const toExpense = ROUTES.expense(data.groupId, data.expenseId)
  const madeAt = dateService.formatDateTime(event.at, navigator.language)

  async function handleRestore() {
    setRestoring(true)
    try {
      const result = await expenseService.restoreVersion(await getDb(), userId, data.groupId, data.expenseId, event.id)
      if (result.ok) {
        message.success(`Expense restored to the version from ${madeAt}.`)
        navigate(toExpense, { direction: 'back' })
        return
      }
      if ('notFound' in result) {
        message.error('This version is no longer available.')
        navigate(ROUTES.group(data.groupId), { direction: 'back' })
        return
      }
      message.error(
        'alreadyCurrent' in result ? 'This version is already the current one.' : 'Restore the expense first to restore a version.',
      )
      onChanged()
    } catch {
      message.error("Couldn't restore the version. Please try again.")
    } finally {
      setRestoring(false)
    }
  }

  function renderAction() {
    if (data.isPayment || data.isCurrent || data.expenseDeleted) return null
    return (
      <Button icon={<UndoOutlined />} style={{ borderRadius: PILL_RADIUS }} loading={restoring} onClick={handleRestore}>
        Restore this version
      </Button>
    )
  }

  // Why there is no button, where there is a version it could have been.
  function renderWhyNot() {
    if (data.isPayment) return null
    if (data.expenseDeleted) return <Text type="secondary">Restore the expense first to restore a version.</Text>
    if (data.isCurrent) return <Text type="secondary">This is the current version.</Text>
    return null
  }

  return (
    <>
      <Flex align="center" justify="space-between" style={{ marginBottom: 16 }}>
        <Flex align="center" gap={8} style={{ minWidth: 0 }}>
          <BackButton onClick={() => navigate(toExpense, { direction: 'back' })} />
          <Title level={3} style={HEADER_TITLE_STYLE}>
            Version
          </Title>
        </Flex>
        {renderAction()}
      </Flex>
      <Flex vertical gap={12}>
        <HistoryEntry
          header={historyHeader(event.by, event.kind, noun, event.restoredFromAt)}
          at={event.at}
          lines={historyLines(event, data.people)}
        />
        {renderWhyNot()}
      </Flex>
      <Divider style={{ margin: '16px 0' }} />
      <ExpenseBody
        description={version.description}
        category={version.category}
        amountMinor={version.amountMinor}
        currency={version.currency}
        date={version.date}
        notes={version.notes}
        method={version.method}
        shares={version.shares}
        receipts={version.receipts}
        datasetId={datasetId}
      />
    </>
  )
}
