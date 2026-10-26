import { App, Button, Flex, Form, Input, InputNumber, Select } from 'antd'
import { useState } from 'react'
import { AdaptiveDialog } from '../../../../components/AdaptiveDialog'
import { AmountInput } from '../../../../components/AmountInput'
import { CurrencySelect } from '../../../../components/CurrencySelect'
import { MAX_STATEMENT_DAY, SPEND_TARGET_PERIODS } from '../../../../db/constants.ts'
import { getDb } from '../../../../db/client.ts'
import type { AccountKind, SpendTargetPeriod } from '../../../../db/types.ts'
import { accountService } from '../../../../services/accountService'
import type { AccountErrors, AccountInput, AccountSummary } from '../../../../services/accountService/types.ts'
import { moneyService } from '../../../../services/moneyService'
import { SPEND_TARGET_LABELS } from '../../content.ts'
import { AccountKindSelector } from './AccountKindSelector'

type Props = {
  open: boolean
  /**
   * The account being edited, or null to add one. The page gives the dialog a
   * new `key` for each opening, so its form starts from what the account has
   * now (a form keeps what was typed in it after it closes).
   */
  account: AccountSummary | null
  onClose: () => void
  /** The user's person id: they are making the change. */
  userId: string
  /** The currency of the device's region, preselected for a new account. */
  regionCurrency: string | null
  /** Called after a change is saved (or the account is gone), so the list is read again. */
  onSaved: () => void
}

type FormValues = {
  kind: AccountKind
  name: string
  currency: string
  statementDay: number | null
  /** The amounts as typed in the account's currency ('1234.5'); empty for none. */
  creditLimit: string
  spendTarget: string
  spendTargetPeriod: SpendTargetPeriod
}

/** Which form field shows the service's message for each of its fields. */
const FORM_FIELD_OF: Record<keyof AccountErrors, keyof FormValues> = {
  name: 'name',
  currency: 'currency',
  statementDay: 'statementDay',
  creditLimitMinor: 'creditLimit',
  spendTargetMinor: 'spendTarget',
  spendTargetPeriod: 'spendTargetPeriod',
}

const FIELD_NAMES = Object.values(FORM_FIELD_OF)

/** What `form.setFields` takes for the fields of this dialog. */
function toFormFields(errors: AccountErrors) {
  const byFormField: Partial<Record<keyof FormValues, string>> = {}
  for (const [field, message] of Object.entries(errors)) {
    byFormField[FORM_FIELD_OF[field as keyof AccountErrors]] = message
  }
  return FIELD_NAMES.map((name) => ({ name, errors: byFormField[name] ? [byFormField[name]] : [] }))
}

function openingValues(account: AccountSummary | null, regionCurrency: string | null): FormValues {
  if (!account) {
    return { kind: 'bank', name: '', currency: regionCurrency ?? '', statementDay: null, creditLimit: '', spendTarget: '', spendTargetPeriod: 'month' }
  }
  const amount = (minor: number | null) => (minor === null ? '' : moneyService.fromMinor(minor, account.currency))
  return {
    kind: account.kind,
    name: account.name,
    currency: account.currency,
    statementDay: account.statementDay,
    creditLimit: amount(account.creditLimitMinor),
    spendTarget: amount(account.spendTargetMinor),
    spendTargetPeriod: account.spendTargetPeriod ?? 'month',
  }
}

function toInput(values: FormValues): AccountInput {
  const minor = (amount: string) => (amount ? moneyService.toMinor(amount, values.currency) : null)
  return {
    kind: values.kind,
    name: values.name ?? '',
    currency: values.currency ?? '',
    statementDay: values.statementDay ?? null,
    creditLimitMinor: minor(values.creditLimit ?? ''),
    spendTargetMinor: minor(values.spendTarget ?? ''),
    spendTargetPeriod: values.spendTargetPeriod,
  }
}

/**
 * The add and edit dialog of the accounts page (PRD 5.17): the type (chosen
 * when adding, fixed when editing), the name and currency, and for a credit
 * card an optional statement day, credit limit and spend target. The currency
 * is switched off once an expense uses the account. Save with nothing changed
 * just closes.
 */
export function AccountDialog({ open, account, onClose, userId, regionCurrency, onSaved }: Props) {
  const [form] = Form.useForm<FormValues>()
  const { message } = App.useApp()
  const [submitting, setSubmitting] = useState(false)
  const [initialValues] = useState(() => openingValues(account, regionCurrency))

  const kind = Form.useWatch('kind', form) ?? initialValues.kind
  const currency = Form.useWatch('currency', form) ?? initialValues.currency
  const adding = account === null

  async function handleFinish(values: FormValues) {
    setSubmitting(true)
    try {
      const db = await getDb()
      const input = toInput(values)
      const result = adding
        ? await accountService.createAccount(db, userId, input)
        : await accountService.updateAccount(db, userId, account.id, input)
      if (!result.ok && 'notFound' in result) {
        message.error('This account is no longer available.')
        onSaved()
        onClose()
        return
      }
      form.setFields(toFormFields(result.ok ? {} : result.errors))
      if (!result.ok) return

      onSaved()
      onClose()
    } catch {
      message.error("Couldn't save the account. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  // A message disappears as soon as its field is edited; amounts keep to a new currency's decimals.
  function handleValuesChange(changed: Partial<FormValues>, all: FormValues) {
    form.setFields((Object.keys(changed) as (keyof FormValues)[]).map((name) => ({ name, errors: [] })))
    if (changed.currency) {
      form.setFieldsValue({
        creditLimit: moneyService.convertInput(all.creditLimit ?? '', changed.currency),
        spendTarget: moneyService.convertInput(all.spendTarget ?? '', changed.currency),
      })
    }
  }

  function renderFooter() {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="primary" loading={submitting} onClick={() => form.submit()}>
          {adding ? 'Add' : 'Save'}
        </Button>
      </div>
    )
  }

  function renderCardFields() {
    return (
      <>
        <Form.Item
          label="Statement day"
          name="statementDay"
          extra={`The day of the month the statement is issued, 1 to ${MAX_STATEMENT_DAY}. Optional.`}
        >
          {/* A whole number: phones show the digits keyboard. */}
          <InputNumber min={1} max={MAX_STATEMENT_DAY} precision={0} controls={false} inputMode="numeric" style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="Credit limit" name="creditLimit" extra="Optional.">
          <AmountInput currency={currency} large={false} align="start" label="Credit limit" />
        </Form.Item>
        <Form.Item label="Spend target" extra="Optional. Counted from the expenses paid with this card.">
          <Flex gap={8} align="flex-start">
            <Form.Item name="spendTargetPeriod" noStyle>
              <Select
                aria-label="Spend target period"
                style={{ width: 150, flex: 'none' }}
                options={SPEND_TARGET_PERIODS.map((period) => ({ value: period, label: SPEND_TARGET_LABELS[period].per }))}
              />
            </Form.Item>
            <Form.Item name="spendTarget" noStyle>
              <AmountInput currency={currency} large={false} align="start" label="Spend target" />
            </Form.Item>
          </Flex>
        </Form.Item>
      </>
    )
  }

  function renderForm() {
    return (
      <Form
        // A name of its own, so the fields' ids do not clash with other forms on the page.
        name="account"
        className="account-form"
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={initialValues}
        onFinish={handleFinish}
        onValuesChange={handleValuesChange}
      >
        <Form.Item label="Type" name="kind">
          <AccountKindSelector disabled={!adding} />
        </Form.Item>
        <Form.Item label="Name" name="name">
          <Input autoFocus={adding} autoComplete="off" placeholder="For example, HDFC Regalia" />
        </Form.Item>
        <Form.Item
          label="Currency"
          name="currency"
          extra={
            account?.inUse
              ? 'Expenses use this account, so its currency cannot change.'
              : 'The currency the account is debited in.'
          }
        >
          <CurrencySelect firstCode={regionCurrency} disabled={account?.inUse} />
        </Form.Item>
        {/* Always on the page, folded away for a bank account, so the sheet's height grows and shrinks smoothly when the type changes. */}
        <div className="account-card-fields" data-open={kind === 'card'} inert={kind !== 'card'}>
          <div>{renderCardFields()}</div>
        </div>
      </Form>
    )
  }

  return (
    <AdaptiveDialog
      open={open}
      onClose={onClose}
      title={adding ? 'Add account' : 'Edit account'}
      footer={renderFooter()}
    >
      {renderForm()}
    </AdaptiveDialog>
  )
}
