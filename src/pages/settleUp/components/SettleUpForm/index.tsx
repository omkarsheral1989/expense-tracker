import { CheckOutlined } from '@ant-design/icons'
import { App, Button, Divider, Flex, Form, Input, Select, Typography } from 'antd'
import { useState } from 'react'
import { useAppNavigate } from '../../../../hooks/useAppNavigate'
import { AmountInput } from '../../../../components/AmountInput'
import { CurrencyField } from '../../../../components/CurrencyField'
import { DateField } from '../../../../components/DateField'
import { GroupTypeIcon } from '../../../../components/GroupTypeIcon'
import { ReceiptsField } from '../../../../components/ReceiptsField'
import { getDb } from '../../../../db/client.ts'
import { EXPENSE_NOTES_MAX_LENGTH } from '../../../../db/constants.ts'
import { useLeaveWarning } from '../../../../hooks/useLeaveWarning'
import { ROUTES } from '../../../../routes.ts'
import { dateService } from '../../../../services/dateService'
import { expenseService } from '../../../../services/expenseService'
import type { GroupDetails } from '../../../../services/groupService/types.ts'
import { moneyService } from '../../../../services/moneyService'
import { photoService } from '../../../../services/photoService'
import type { ReceiptInput } from '../../../../services/photoService/types.ts'
import type { FormValues } from './types.ts'
import { hasUnsavedInput, memberLabel, recentCurrencyCodes, toFormFields } from './utils.ts'
import { HEADER_TITLE_STYLE } from '../../../../theme/headerTitle.ts'
import { BackButton } from '../../../../components/BackButton'
import { dialogLayer } from '../../../../components/DialogLayer'
import { useQueryClient } from '@tanstack/react-query'
import { refreshGroupPage } from '../../../group/utils.ts'
import { useConfirm } from '../../../../hooks/useConfirm'

const { Text, Title } = Typography

/** The notes box shows how many characters are used once this many are typed. */
const NOTES_COUNTER_FROM = 900

type Props = {
  group: GroupDetails
  /** Names the device's photo store, where receipt photos are kept. */
  datasetId: string
  /** The user's person id: the payment is saved as added by them. */
  userId: string
  /** The currencies of the user's latest expenses, most recent first. */
  recentCurrencies: string[]
}

/**
 * Records a payment between two members of a group: who paid, who received it,
 * how much, and when. Saved with the tick in the header.
 */
export function SettleUpForm({ group, datasetId, userId, recentCurrencies }: Props) {
  const [form] = Form.useForm<FormValues>()
  const { message } = App.useApp()
  const confirm = useConfirm()
  const navigate = useAppNavigate()
  const queryClient = useQueryClient()
  const [submitting, setSubmitting] = useState(false)

  const [initialValues] = useState<FormValues>(() => ({
    payerId: userId,
    recipientId: undefined,
    amount: '',
    currency: group.defaultCurrency,
    date: dateService.toDay(new Date()),
    notes: '',
    receipts: [],
  }))
  const payerId = Form.useWatch('payerId', form) ?? initialValues.payerId
  const recipientId = Form.useWatch('recipientId', form)
  const currency = Form.useWatch('currency', form) ?? initialValues.currency

  const hasInput = hasUnsavedInput(Form.useWatch([], form), initialValues)
  useLeaveWarning(hasInput)

  const payer = group.members.find((member) => member.personId === payerId)
  const recipient = group.members.find((member) => member.personId === recipientId)

  function leave() {
    navigate(ROUTES.group(group.id), { direction: 'back' })
  }

  function handleLeave() {
    if (!hasInput) {
      leave()
      return
    }
    confirm({
      // In the layer that stays in front while the page changes after it (`dialogLayer`).
      getContainer: dialogLayer,
      title: 'Discard this payment?',
      content: 'What you entered will be lost.',
      okText: 'Discard',
      okButtonProps: { danger: true },
      cancelText: 'Keep editing',
      onOk: leave,
    })
  }

  async function handleFinish(values: FormValues) {
    setSubmitting(true)
    const photos = photoService.open(datasetId)
    let receipts: ReceiptInput[] = []
    try {
      // The photos are kept first, so the payment never points at a photo
      // that is not there; they are removed again if it is not saved.
      receipts = await photoService.storeReceipts(photos, values.receipts)
      const result = await expenseService.createSettlement(await getDb(), userId, group.id, {
        payerId: values.payerId,
        recipientId: values.recipientId ?? '',
        amountMinor: moneyService.toMinor(values.amount, values.currency),
        currency: values.currency,
        date: values.date,
        notes: values.notes,
        receipts,
      })

      // Every problem is shown at once, each beside its own field.
      form.setFields(toFormFields(result.ok ? {} : result.errors))
      if (!result.ok) {
        await photoService.removeReceipts(photos, receipts.map((receipt) => receipt.id))
        return
      }

      // The group page comes back with the payment already on it, so the way back is not cut short (PRD 5.16).
      await refreshGroupPage(queryClient, userId, group.id)
      message.success('Payment recorded.')
      leave()
    } catch {
      await photoService
        .removeReceipts(photos, receipts.map((receipt) => receipt.id))
        .catch(() => undefined)
      message.error("Couldn't record the payment. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  function handleValuesChange(changed: Partial<FormValues>, all: FormValues) {
    // A message disappears as soon as its field is edited.
    const fields = Object.keys(changed) as (keyof FormValues)[]
    // Someone cannot pay themselves: choosing the recipient as the payer
    // empties the recipient.
    if (changed.payerId && changed.payerId === all.recipientId) {
      form.setFieldValue('recipientId', undefined)
      fields.push('recipientId')
    }
    form.setFields(fields.map((name) => ({ name, errors: [] })))

    // The amount keeps to the decimals of the new currency.
    if (changed.currency) {
      form.setFieldValue('amount', moneyService.convertInput(all.amount, changed.currency))
    }
  }

  function renderHeader() {
    return (
      // Comes in from the top when the page opens from the group page's pill (PRD 5.16).
      <Flex align="center" justify="space-between" gap={8} data-vt="header" style={{ marginBottom: 16 }}>
        <Flex align="center" gap={8}>
          <BackButton onClick={handleLeave} />
          <Title level={3} style={HEADER_TITLE_STYLE}>
            Settle up
          </Title>
        </Flex>
        <Button
          type="primary"
          shape="circle"
          htmlType="submit"
          icon={<CheckOutlined />}
          aria-label="Save"
          loading={submitting}
        />
      </Flex>
    )
  }

  function renderGroup() {
    return (
      <Flex align="center" gap={8} style={{ marginBottom: 16 }}>
        <GroupTypeIcon type={group.type} size={24} />
        <Text type="secondary" style={{ overflowWrap: 'anywhere' }}>
          {group.name}
        </Text>
      </Flex>
    )
  }

  function renderWho() {
    const payerOptions = group.members.map((member) => ({
      value: member.personId,
      label: memberLabel(member),
    }))
    // The payer cannot also be the recipient.
    const recipientOptions = group.members
      .filter((member) => member.personId !== payerId)
      .map((member) => ({ value: member.personId, label: memberLabel(member) }))

    return (
      <>
        <Form.Item label="Who paid?" name="payerId" style={{ marginBottom: 16 }}>
          <Select options={payerOptions} />
        </Form.Item>
        <Form.Item label="Who received it?" name="recipientId" style={{ marginBottom: 16 }}>
          <Select placeholder="Choose a person" options={recipientOptions} />
        </Form.Item>
      </>
    )
  }

  function renderSentence() {
    if (!payer || !recipient) return null
    return (
      <Title
        level={4}
        style={{ textAlign: 'center', margin: '8px 0 16px', overflowWrap: 'anywhere' }}
      >
        {expenseService.settlementSentence(payer, recipient)}
      </Title>
    )
  }

  function renderAmount() {
    return (
      <Flex align="flex-start" gap={12}>
        <Form.Item name="currency" style={{ marginBottom: 16 }}>
          <CurrencyField recentCodes={recentCurrencyCodes(group.defaultCurrency, recentCurrencies)} />
        </Form.Item>
        <Form.Item name="amount" style={{ flex: 1, minWidth: 0, marginBottom: 16 }}>
          <AmountInput currency={currency} />
        </Form.Item>
      </Flex>
    )
  }

  function renderDetails() {
    return (
      <>
        <Form.Item name="date" style={{ marginBottom: 16 }}>
          <DateField />
        </Form.Item>
        <Form.Item name="notes" style={{ marginBottom: 16 }}>
          <Input.TextArea
            aria-label="Notes"
            placeholder="Notes"
            autoSize={{ minRows: 2, maxRows: 6 }}
            count={{
              max: EXPENSE_NOTES_MAX_LENGTH,
              show: ({ count, maxLength }) =>
                count >= NOTES_COUNTER_FROM ? `${count} / ${maxLength}` : null,
              exceedFormatter: (text, { max }) => text.slice(0, max),
            }}
          />
        </Form.Item>
        <Form.Item name="receipts" style={{ marginBottom: 0 }}>
          <ReceiptsField />
        </Form.Item>
      </>
    )
  }

  return (
    <>
      <title>Settle up · OwnLedger</title>
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={initialValues}
        onFinish={handleFinish}
        onValuesChange={handleValuesChange}
      >
        {renderHeader()}
        {renderGroup()}
        {renderWho()}
        {renderSentence()}
        {renderAmount()}
        <Divider style={{ margin: '0 0 16px' }} />
        {renderDetails()}
      </Form>
    </>
  )
}
