import { z } from 'zod'
import { GROUP_NAME_MAX_LENGTH, GROUP_TYPES } from '../../db/constants.ts'
import { currencyService } from '../currencyService'
import { MEMBER_EMAIL_DOMAIN } from './constants.ts'
import type { CreateGroupErrors, CreateGroupField } from './types.ts'

const GMAIL_ADDRESS = new RegExp(`^[a-z0-9._+-]+@${MEMBER_EMAIL_DOMAIN.replace('.', '\\.')}$`)

/** Trims, lower-cases and drops repeats, keeping the first of each. */
export function normalizeEmails(emails: string[]): string[] {
  const cleaned = emails.map((email) => email.trim().toLowerCase())
  return [...new Set(cleaned.filter((email) => email !== ''))]
}

/**
 * The rules for a new group. The form and the save function share it.
 * Parsing also cleans the input: the name is trimmed, and member emails are
 * lower-cased with repeats removed, so adding someone twice is harmless.
 */
export const createGroupSchema = z.object({
  name: z
    .string({ error: 'Enter a group name.' })
    .trim()
    .min(1, 'Enter a group name.')
    .max(GROUP_NAME_MAX_LENGTH, `Use at most ${GROUP_NAME_MAX_LENGTH} characters.`),
  type: z.enum(GROUP_TYPES, { error: 'Choose a group type.' }),
  defaultCurrency: z
    .string({ error: 'Choose a currency.' })
    .refine(currencyService.isValid, 'Choose a currency.'),
  memberEmails: z
    .array(z.string())
    .transform(normalizeEmails)
    .superRefine((emails, context) => {
      const rejected = emails.filter((email) => !GMAIL_ADDRESS.test(email))
      if (rejected.length > 0) {
        context.addIssue({
          code: 'custom',
          message: `Only @${MEMBER_EMAIL_DOMAIN} addresses can be added: ${rejected.join(', ')}`,
        })
      }
    }),
})

export type ValidCreateGroupInput = z.output<typeof createGroupSchema>

const FIELDS: readonly string[] = Object.keys(createGroupSchema.shape)

/** The first problem of each field, ready to show beside it. */
export function toFieldErrors(error: z.ZodError): CreateGroupErrors {
  const errors: CreateGroupErrors = {}
  for (const issue of error.issues) {
    const field = issue.path[0]
    if (typeof field === 'string' && FIELDS.includes(field)) {
      errors[field as CreateGroupField] ??= issue.message
    }
  }
  return errors
}
