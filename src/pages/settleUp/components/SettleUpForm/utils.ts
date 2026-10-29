import type { FormInstance } from 'antd'
import { RECENT_CURRENCY_COUNT } from '../../../../services/expenseService/constants.ts'
import type { CreateSettlementErrors } from '../../../../services/expenseService/types.ts'
import type { GroupMember } from '../../../../services/groupService/types.ts'
import { groupService } from '../../../../services/groupService'
import type { FormValues } from './types.ts'

/** What `form.setFields` takes: a name and its messages for each field. */
type FieldData = Parameters<FormInstance['setFields']>[0][number]

const FIELDS = ['payerId', 'recipientId', 'amount', 'currency', 'date', 'notes', 'receipts'] as const

/**
 * What the currency picker lists as "Recent": the group's default currency
 * first, then the user's most recently used ones, each once, at most three.
 */
export function recentCurrencyCodes(groupDefault: string, recent: readonly string[]): string[] {
  return [...new Set([groupDefault, ...recent])].slice(0, RECENT_CURRENCY_COUNT)
}

/** How the form names a member: "You", or their name (their email when no name is known). */
export function memberLabel(member: GroupMember): string {
  return member.isYou ? 'You' : groupService.displayName(member)
}

/**
 * Whether the user has entered or changed anything since the form opened. Used
 * to decide if leaving needs a "Discard this payment?" confirmation.
 */
export function hasUnsavedInput(values: Partial<FormValues> | undefined, initial: FormValues): boolean {
  if (!values) return false

  return (
    values.payerId !== initial.payerId ||
    // Compared with the opening values, not with empty ones: a payment the balances page filled in is not input yet.
    values.recipientId !== initial.recipientId ||
    (values.amount ?? '') !== initial.amount ||
    (values.notes ?? '').trim() !== '' ||
    values.currency !== initial.currency ||
    values.date !== initial.date ||
    (values.receipts ?? []).length > 0
  )
}

/**
 * Turns the service's messages into what the form needs: the message under each
 * field that has a problem, and no message under the others. The service names
 * the amount `amountMinor`; the form calls it `amount`.
 */
export function toFormFields(errors: CreateSettlementErrors): FieldData[] {
  const byField: Partial<Record<(typeof FIELDS)[number], string>> = {
    ...errors,
    amount: errors.amountMinor,
  }
  return FIELDS.map((name) => ({
    name,
    errors: byField[name] ? [byField[name]] : [],
  }))
}
