import type { FormInstance } from 'antd'
import { RECENT_CURRENCY_COUNT } from '../../../../services/expenseService/constants.ts'
import type { CreateExpenseErrors } from '../../../../services/expenseService/types.ts'
import { MONTH_NAMES, WEEKDAY_NAMES } from './constants.ts'
import type { FormValues } from './types.ts'

/** What `form.setFields` takes: a name and its messages for each field. */
type FieldData = Parameters<FormInstance['setFields']>[0][number]

const FIELDS = ['description', 'category', 'amount', 'currency', 'date', 'notes'] as const

/** A day as 'YYYY-MM-DD', in the device's own time zone. */
export function toDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** 'YYYY-MM-DD' as a local date at midnight. */
function fromDay(day: string): Date {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date)
}

/**
 * How the date row shows a day: "Today, 8 Oct 2026", "Yesterday, 7 Oct 2026",
 * or the weekday for any other day ("Mon, 5 Oct 2026"). `today` is a
 * 'YYYY-MM-DD' too, so the result does not depend on the clock.
 */
export function formatDay(day: string, today: string): string {
  const date = fromDay(day)
  const yesterday = fromDay(today)
  yesterday.setDate(yesterday.getDate() - 1)

  let prefix: string = WEEKDAY_NAMES[date.getDay()]
  if (day === today) prefix = 'Today'
  else if (day === toDay(yesterday)) prefix = 'Yesterday'

  return `${prefix}, ${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`
}

/**
 * What the currency picker lists as "Recent": the group's default currency
 * first, then the user's most recently used ones, each once, at most three.
 */
export function recentCurrencyCodes(groupDefault: string, recent: readonly string[]): string[] {
  return [...new Set([groupDefault, ...recent])].slice(0, RECENT_CURRENCY_COUNT)
}

/**
 * Whether the user has typed or changed anything since the form opened. Used to
 * decide if leaving needs a "Discard this expense?" confirmation.
 */
export function hasUnsavedInput(
  values: Partial<FormValues> | undefined,
  initial: FormValues,
): boolean {
  if (!values) return false

  return (
    (values.description ?? '').trim() !== '' ||
    (values.amount ?? '') !== '' ||
    (values.notes ?? '').trim() !== '' ||
    values.category !== initial.category ||
    values.currency !== initial.currency ||
    values.date !== initial.date
  )
}

/**
 * Turns the service's messages into what the form needs: the message under each
 * field that has a problem, and no message under the others. The service names
 * the amount `amountMinor`; the form calls it `amount`.
 */
export function toFormFields(errors: CreateExpenseErrors): FieldData[] {
  const byField: Partial<Record<(typeof FIELDS)[number], string>> = {
    ...errors,
    amount: errors.amountMinor,
  }
  return FIELDS.map((name) => ({
    name,
    errors: byField[name] ? [byField[name]] : [],
  }))
}
