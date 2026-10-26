import { z } from 'zod'
import { ACCOUNT_KINDS, ACCOUNT_NAME_MAX_LENGTH, MAX_STATEMENT_DAY, SPEND_TARGET_PERIODS } from '../../db/constants.ts'
import { currencyService } from '../currencyService'
import { moneyService } from '../moneyService'
import type { AccountErrors, AccountField } from './types.ts'

const optionalNumber = z.number().int().nullish().transform((value) => value ?? null)

/** What a bank account has of a card's options: none. They may still be in the input (the dialog keeps what was typed for a card), and are dropped before they are checked. */
const NO_CARD_OPTIONS = { statementDay: null, creditLimitMinor: null, spendTargetMinor: null, spendTargetPeriod: null }

const accountFields = z
  .object({
    kind: z.enum(ACCOUNT_KINDS),
    name: z
      .string({ error: 'Enter a name.' })
      .transform((name) => name.trim().replace(/\s+/g, ' '))
      .pipe(
        z
          .string()
          .min(1, 'Enter a name.')
          .max(ACCOUNT_NAME_MAX_LENGTH, `Use at most ${ACCOUNT_NAME_MAX_LENGTH} characters.`),
      ),
    currency: z.string({ error: 'Choose a currency.' }).refine(currencyService.isValid, 'Choose a currency.'),
    statementDay: z
      .number({ error: `Enter a day from 1 to ${MAX_STATEMENT_DAY}.` })
      .int(`Enter a day from 1 to ${MAX_STATEMENT_DAY}.`)
      .min(1, `Enter a day from 1 to ${MAX_STATEMENT_DAY}.`)
      .max(MAX_STATEMENT_DAY, `Enter a day from 1 to ${MAX_STATEMENT_DAY}.`)
      .nullish()
      .transform((day) => day ?? null),
    creditLimitMinor: optionalNumber,
    spendTargetMinor: optionalNumber,
    spendTargetPeriod: z.enum(SPEND_TARGET_PERIODS).nullish().transform((period) => period ?? null),
  })
  .superRefine((account, context) => {
    if (!currencyService.isValid(account.currency)) return
    const issue = (path: AccountField, message: string) => context.addIssue({ code: 'custom', path: [path], message })
    const max = moneyService.maxMinor(account.currency)
    for (const field of ['creditLimitMinor', 'spendTargetMinor'] as const) {
      const value = account[field]
      if (value !== null && (value <= 0 || value > max)) {
        issue(field, value <= 0 ? 'Enter an amount more than 0.' : 'That amount is too large.')
      }
    }
    if (account.spendTargetMinor !== null && account.spendTargetPeriod === null) {
      issue('spendTargetPeriod', 'Choose month or quarter.')
    }
  })
  .transform((account) => ({ ...account, spendTargetPeriod: account.spendTargetMinor === null ? null : account.spendTargetPeriod }))

/**
 * The rules for an account. The dialog and the save functions share it.
 * Parsing also cleans the input: the name is trimmed with its inner spaces
 * collapsed, and everything a bank account does not have becomes null.
 */
export const accountSchema = z.preprocess(
  (input) => (typeof input === 'object' && input !== null && (input as { kind?: unknown }).kind === 'bank' ? { ...input, ...NO_CARD_OPTIONS } : input),
  accountFields,
)

const FIELDS: readonly string[] = ['name', 'currency', 'statementDay', 'creditLimitMinor', 'spendTargetMinor', 'spendTargetPeriod']

/** The first problem of each field, ready to show beside it. */
export function toFieldErrors(error: z.ZodError): AccountErrors {
  const errors: AccountErrors = {}
  for (const issue of error.issues) {
    const field = issue.path[0]
    if (typeof field === 'string' && FIELDS.includes(field)) {
      errors[field as AccountField] ??= issue.message
    }
  }
  return errors
}
