import { z } from 'zod'
import {
  EXPENSE_DESCRIPTION_MAX_LENGTH,
  EXPENSE_NOTES_MAX_LENGTH,
} from '../../db/constants.ts'
import { currencyService } from '../currencyService'
import { moneyService } from '../moneyService'
import type { CreateExpenseErrors, CreateExpenseField } from './types.ts'
import { isCategoryKey } from './utils.ts'

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** Whether 'YYYY-MM-DD' is a real day of the calendar ('2026-02-30' is not). */
function isRealDay(day: string): boolean {
  const date = new Date(`${day}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(day)
}

/**
 * The rules for a new expense. The form and the save function share it.
 * Parsing trims the description and notes; empty notes become null.
 */
export const createExpenseSchema = z
  .object({
    description: z
      .string({ error: 'Enter a description.' })
      .trim()
      .min(1, 'Enter a description.')
      .max(
        EXPENSE_DESCRIPTION_MAX_LENGTH,
        `Use at most ${EXPENSE_DESCRIPTION_MAX_LENGTH} characters.`,
      ),
    category: z.string().refine(isCategoryKey, 'Choose a category.'),
    amountMinor: z
      .number({ error: 'Enter an amount.' })
      .int('Enter an amount.')
      .positive('Enter an amount more than 0.'),
    currency: z
      .string({ error: 'Choose a currency.' })
      .refine(currencyService.isValid, 'Choose a currency.'),
    date: z
      .string({ error: 'Choose a date.' })
      .refine((day) => DAY.test(day) && isRealDay(day), 'Choose a date.'),
    notes: z
      .string()
      .trim()
      .max(EXPENSE_NOTES_MAX_LENGTH, `Use at most ${EXPENSE_NOTES_MAX_LENGTH} characters.`)
      .transform((notes) => notes || null),
  })
  .superRefine((expense, context) => {
    // The limit depends on the currency's decimals, so it is checked here. It
    // runs alongside the other fields' checks, so every message shows at once;
    // an unknown currency has its own message and no limit.
    if (
      currencyService.isValid(expense.currency) &&
      expense.amountMinor > moneyService.maxMinor(expense.currency)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['amountMinor'],
        message: `Enter at most ${moneyService.maxAmount.toLocaleString('en-US')}.`,
      })
    }
  })

export type ValidCreateExpenseInput = z.output<typeof createExpenseSchema>

const FIELDS: readonly string[] = Object.keys(createExpenseSchema.shape)

/** The first problem of each field, ready to show beside it. */
export function toFieldErrors(error: z.ZodError): CreateExpenseErrors {
  const errors: CreateExpenseErrors = {}
  for (const issue of error.issues) {
    const field = issue.path[0]
    if (typeof field === 'string' && FIELDS.includes(field)) {
      errors[field as CreateExpenseField] ??= issue.message
    }
  }
  return errors
}
