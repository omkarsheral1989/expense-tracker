import { ArrowLeftOutlined, CheckOutlined } from '@ant-design/icons'
import { App, Button, Divider, Flex, Form, Input, Typography } from 'antd'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { EXPENSE_NOTES_MAX_LENGTH } from '../../db/constants.ts'
import { useLeaveWarning } from '../../hooks/useLeaveWarning'
import type { CreateExpenseErrors, CreateExpenseInput } from '../../services/expenseService/types.ts'
import type { GroupDetails } from '../../services/groupService/types.ts'
import { moneyService } from '../../services/moneyService'
import { photoService } from '../../services/photoService'
import type { ReceiptInput } from '../../services/photoService/types.ts'
import { AmountInput } from '../AmountInput'
import { CategoryField } from './CategoryField'
import { NOTES_COUNTER_FROM } from './constants.ts'
import { CurrencyField } from '../CurrencyField'
import { DateField } from '../DateField'
import { ReceiptsField } from '../ReceiptsField'
import { SplitField } from './SplitField'
import { splitProblem } from './SplitField/utils.ts'
import type { FormValues } from './types.ts'
import { hasUnsavedInput, recentCurrencyCodes, toFormFields } from './utils.ts'

const { Title } = Typography

/** What happened to the expense when the form was saved. */
export type SaveOutcome =
  /** It was saved. `message` is shown (none for an edit that changed nothing); `to` is where to go, `leaveTo` by default. */
  | { status: 'saved'; message?: string; to?: string }
  /** Something in the input is wrong; one message per field, shown beside it. */
  | { status: 'invalid'; errors: CreateExpenseErrors }
  /** The expense can no longer be saved here (it was deleted meanwhile): `message` is shown and the user goes to `to`. */
  | { status: 'gone'; message: string; to: string }

type Props = {
  group: GroupDetails
  /** Names the device's photo store, where receipt photos are kept. */
  datasetId: string
  /** The currencies of the user's latest expenses, most recent first. */
  recentCurrencies: string[]
  /** The heading, and the title of the browser tab before " · OwnLedger": "Add expense" or "Edit expense". */
  heading: string
  /** What the form has when nothing was entered: leaving asks for confirmation once the form differs from it. */
  initialValues: FormValues
  /** What the form shows at first when that is not `initialValues` (fields carried over from another group); leave out otherwise. */
  startValues?: FormValues
  /** The group the expense is in, under the header: a switcher when adding, a plain label when editing. Given a way to read what has been entered so far. */
  renderGroupPicker: (readValues: () => FormValues) => ReactNode
  /** What "Back" asks when something was entered: its title and text. */
  discardPrompt: { title: string; content: string }
  /** Where the user goes after saving and when they leave. */
  leaveTo: string
  /** Shown when saving fails unexpectedly. */
  failureMessage: string
  /** Saves what the form holds, with its photos already kept in the photo store; the form removes them again when this does not save. */
  onSave: (input: CreateExpenseInput) => Promise<SaveOutcome>
}

/**
 * The expense form, for adding an expense and for editing one: what it was
 * for, how much, and when, who paid and how it is split, notes and receipt
 * photos. Saved with the tick in the header. What differs between the two
 * pages (opening values, group picker, wording, the save itself) is passed in.
 */
export function ExpenseForm({
  group,
  datasetId,
  recentCurrencies,
  heading,
  initialValues,
  startValues: carriedValues,
  renderGroupPicker,
  discardPrompt,
  leaveTo,
  failureMessage,
  onSave,
}: Props) {
  const [form] = Form.useForm<FormValues>()
  const { message, modal } = App.useApp()
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)

  const [startValues] = useState<FormValues>(() => ({ keptReceipts: [], ...(carriedValues ?? initialValues) }))
  const currency = Form.useWatch('currency', form) ?? startValues.currency
  const amount = Form.useWatch('amount', form) ?? startValues.amount
  const split = Form.useWatch('split', form) ?? startValues.split
  const keptReceipts = Form.useWatch('keptReceipts', form) ?? startValues.keptReceipts ?? []
  const amountMinor = moneyService.toMinor(amount, currency)
  // Shown under the split as soon as it stops adding up, for example after the
  // amount changed under exact amounts. Saving refuses it too.
  const liveSplitProblem = splitProblem(amountMinor, split, group.members)

  const hasInput = hasUnsavedInput(Form.useWatch([], form), initialValues)
  useLeaveWarning(hasInput)

  function leave(to: string = leaveTo) {
    navigate(to)
  }

  function handleLeave() {
    if (!hasInput) {
      leave()
      return
    }
    modal.confirm({
      title: discardPrompt.title,
      content: discardPrompt.content,
      okText: 'Discard',
      okButtonProps: { danger: true },
      cancelText: 'Keep editing',
      onOk: () => leave(),
    })
  }

  async function handleFinish(values: FormValues) {
    setSubmitting(true)
    const photos = photoService.open(datasetId)
    let added: ReceiptInput[] = []
    try {
      // The new photos are kept first, so the expense never points at a photo
      // that is not there; they are removed again if the expense is not saved.
      added = await photoService.storeReceipts(photos, values.receipts)
      const outcome = await onSave({
        description: values.description,
        category: values.category,
        amountMinor: moneyService.toMinor(values.amount, values.currency),
        currency: values.currency,
        date: values.date,
        notes: values.notes,
        paidBy: values.split.paidBy,
        split: { method: values.split.method, values: values.split.values },
        receipts: [...(values.keptReceipts ?? []), ...added],
      })

      // Every problem is shown at once, each beside its own field.
      form.setFields(toFormFields(outcome.status === 'invalid' ? outcome.errors : {}))
      if (outcome.status === 'invalid') {
        await photoService.removeReceipts(photos, added.map((receipt) => receipt.id))
        return
      }
      if (outcome.status === 'gone') {
        await photoService.removeReceipts(photos, added.map((receipt) => receipt.id))
        message.error(outcome.message)
        leave(outcome.to)
        return
      }

      if (outcome.message) message.success(outcome.message)
      leave(outcome.to)
    } catch {
      await photoService
        .removeReceipts(photos, added.map((receipt) => receipt.id))
        .catch(() => undefined)
      message.error(failureMessage)
    } finally {
      setSubmitting(false)
    }
  }

  function handleValuesChange(changed: Partial<FormValues>, all: FormValues) {
    // A message disappears as soon as its field is edited. The split is
    // checked against the amount, so a new amount or currency clears its
    // message too; it comes back at once if the split still does not add up.
    const fields = Object.keys(changed).filter((name) => name !== 'keptReceipts') as (keyof FormValues)[]
    if (changed.keptReceipts) fields.push('receipts')
    if (changed.amount !== undefined || changed.currency) fields.push('split')
    form.setFields(fields.map((name) => ({ name, errors: [] })))

    // The amount keeps to the decimals of the new currency.
    if (changed.currency) {
      form.setFieldValue('amount', moneyService.convertInput(all.amount, changed.currency))
    }
  }

  function renderHeader() {
    return (
      <Flex align="center" justify="space-between" gap={8} style={{ marginBottom: 16 }}>
        <Flex align="center" gap={8}>
          <Button type="text" icon={<ArrowLeftOutlined />} aria-label="Back" onClick={handleLeave} />
          <Title level={3} style={{ margin: 0 }}>
            {heading}
          </Title>
        </Flex>
        <Button
          type="primary"
          htmlType="submit"
          icon={<CheckOutlined />}
          aria-label="Save"
          loading={submitting}
        />
      </Flex>
    )
  }

  function renderWhatAndHowMuch() {
    return (
      <>
        <Flex align="flex-start" gap={12}>
          <Form.Item name="category" style={{ marginBottom: 16 }}>
            <CategoryField />
          </Form.Item>
          <Form.Item name="description" style={{ flex: 1, minWidth: 0, marginBottom: 16 }}>
            <Input
              aria-label="Description"
              placeholder="Enter a description"
              autoComplete="off"
            />
          </Form.Item>
        </Flex>
        <Flex align="flex-start" gap={12}>
          <Form.Item name="currency" style={{ marginBottom: 16 }}>
            <CurrencyField recentCodes={recentCurrencyCodes(group.defaultCurrency, recentCurrencies)} />
          </Form.Item>
          <Form.Item name="amount" style={{ flex: 1, minWidth: 0, marginBottom: 16 }}>
            <AmountInput currency={currency} />
          </Form.Item>
        </Flex>
      </>
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
        {/* Registered, so that the photos the expense already has reach `handleFinish` with the rest of the values. */}
        <Form.Item name="keptReceipts" hidden noStyle />
        <Form.Item name="receipts" style={{ marginBottom: 0 }}>
          <ReceiptsField
            stored={keptReceipts}
            onStoredChange={(next) => form.setFieldValue('keptReceipts', next)}
            photoStore={photoService.open(datasetId)}
          />
        </Form.Item>
      </>
    )
  }

  return (
    <>
      <title>{`${heading} · OwnLedger`}</title>
      <Form
        form={form}
        requiredMark={false}
        initialValues={startValues}
        onFinish={handleFinish}
        onValuesChange={handleValuesChange}
      >
        {renderHeader()}
        {renderGroupPicker(() => form.getFieldsValue(true) as FormValues)}
        <Divider style={{ margin: '16px 0' }} />
        {renderWhatAndHowMuch()}
        <Form.Item
          name="split"
          style={{ marginBottom: 0 }}
          help={liveSplitProblem ?? undefined}
          validateStatus={liveSplitProblem ? 'error' : undefined}
        >
          <SplitField members={group.members} amountMinor={amountMinor} currency={currency} />
        </Form.Item>
        <Divider style={{ margin: '16px 0' }} />
        {renderDetails()}
      </Form>
    </>
  )
}
