import { ArrowLeftOutlined, CheckOutlined } from '@ant-design/icons'
import { App, Button, Card, Divider, Flex, Form, Input, Typography } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { EXPENSE_NOTES_MAX_LENGTH } from '../../../../db/constants.ts'
import { getDb } from '../../../../db/client.ts'
import { useLeaveWarning } from '../../../../hooks/useLeaveWarning'
import { ROUTES } from '../../../../routes.ts'
import { expenseService } from '../../../../services/expenseService'
import type { GroupDetails } from '../../../../services/groupService/types.ts'
import { moneyService } from '../../../../services/moneyService'
import { AmountInput } from './AmountInput'
import { CategoryField } from './CategoryField'
import { NOTES_COUNTER_FROM } from './constants.ts'
import { CurrencyField } from './CurrencyField'
import { DateField } from './DateField'
import { ReceiptsRow } from './ReceiptsRow'
import { SplitField } from './SplitField'
import { initialSplit, splitProblem } from './SplitField/utils.ts'
import type { FormValues } from './types.ts'
import { hasUnsavedInput, recentCurrencyCodes, toDay, toFormFields } from './utils.ts'
import { WithChip } from './WithChip'

const { Title } = Typography

type Props = {
  group: GroupDetails
  /** The signed-in user's email: they pay, and the expense is saved as theirs. */
  userEmail: string
  /** The currencies of the user's latest expenses, most recent first. */
  recentCurrencies: string[]
}

/**
 * A new expense in a group: what it was for, how much, and when. Saved with
 * the tick in the header, with who paid and how it is split.
 */
export function AddExpenseForm({ group, userEmail, recentCurrencies }: Props) {
  const [form] = Form.useForm<FormValues>()
  const { message, modal } = App.useApp()
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)

  const [initialValues] = useState<FormValues>(() => ({
    description: '',
    category: expenseService.defaultCategory,
    amount: '',
    currency: group.defaultCurrency,
    date: toDay(new Date()),
    notes: '',
    split: initialSplit(group.members),
  }))
  const currency = Form.useWatch('currency', form) ?? initialValues.currency
  const amount = Form.useWatch('amount', form) ?? ''
  const split = Form.useWatch('split', form) ?? initialValues.split
  const amountMinor = moneyService.toMinor(amount, currency)
  // Shown under the split as soon as it stops adding up, for example after the
  // amount changed under exact amounts. Saving refuses it too.
  const liveSplitProblem = splitProblem(amountMinor, split, group.members)

  const hasInput = hasUnsavedInput(Form.useWatch([], form), initialValues)
  useLeaveWarning(hasInput)

  function leave() {
    navigate(ROUTES.group(group.id))
  }

  function handleLeave() {
    if (!hasInput) {
      leave()
      return
    }
    modal.confirm({
      title: 'Discard this expense?',
      content: 'What you entered will be lost.',
      okText: 'Discard',
      okButtonProps: { danger: true },
      cancelText: 'Keep editing',
      onOk: leave,
    })
  }

  async function handleFinish(values: FormValues) {
    setSubmitting(true)
    try {
      const result = await expenseService.createExpense(await getDb(), userEmail, group.id, {
        description: values.description,
        category: values.category,
        amountMinor: moneyService.toMinor(values.amount, values.currency),
        currency: values.currency,
        date: values.date,
        notes: values.notes,
        paidBy: values.split.paidBy,
        split: { method: values.split.method, values: values.split.values },
      })

      // Every problem is shown at once, each beside its own field.
      form.setFields(toFormFields(result.ok ? {} : result.errors))
      if (!result.ok) return

      message.success('Expense added.')
      leave()
    } catch {
      message.error("Couldn't add the expense. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  function handleValuesChange(changed: Partial<FormValues>, all: FormValues) {
    // A message disappears as soon as its field is edited. The split is
    // checked against the amount, so a new amount or currency clears its
    // message too; it comes back at once if the split still does not add up.
    const fields = Object.keys(changed) as (keyof FormValues)[]
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
            Add expense
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
          <Form.Item name="description" style={{ flex: 1, minWidth: 0, marginBottom: 16, paddingTop: 8 }}>
            <Input
              variant="underlined"
              size="large"
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
        <Form.Item name="date" style={{ marginBottom: 8 }}>
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
        <ReceiptsRow />
      </>
    )
  }

  return (
    <Card>
      <title>Add expense · OwnLedger</title>
      <Form
        form={form}
        requiredMark={false}
        initialValues={initialValues}
        onFinish={handleFinish}
        onValuesChange={handleValuesChange}
      >
        {renderHeader()}
        <WithChip groupName={group.name} />
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
    </Card>
  )
}
