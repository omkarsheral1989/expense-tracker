import { z } from 'zod'
import { MEMBER_EMAIL_DOMAIN, PERSON_NAME_MAX_LENGTH } from './constants.ts'
import type { AddPersonErrors, AddPersonField } from './types.ts'

const GMAIL_ADDRESS = new RegExp(`^[a-z0-9._+-]+@${MEMBER_EMAIL_DOMAIN.replace('.', '\\.')}$`)

/**
 * The rules for a new member. The dialog and the save function share it.
 * Parsing also cleans the input: the name is trimmed with its inner spaces
 * collapsed, and the email is trimmed and lower-cased (an empty one means none).
 */
export const addPersonSchema = z.object({
  name: z
    .string({ error: 'Enter a name.' })
    .transform((name) => name.trim().replace(/\s+/g, ' '))
    .pipe(
      z
        .string()
        .min(1, 'Enter a name.')
        .max(PERSON_NAME_MAX_LENGTH, `Use at most ${PERSON_NAME_MAX_LENGTH} characters.`),
    ),
  email: z
    .string()
    .optional()
    .transform((email) => email?.trim().toLowerCase() || undefined)
    .refine(
      (email) => email === undefined || GMAIL_ADDRESS.test(email),
      `Only @${MEMBER_EMAIL_DOMAIN} addresses can be added.`,
    ),
})

const FIELDS: readonly string[] = Object.keys(addPersonSchema.shape)

/** The first problem of each field, ready to show beside it. */
export function toFieldErrors(error: z.ZodError): AddPersonErrors {
  const errors: AddPersonErrors = {}
  for (const issue of error.issues) {
    const field = issue.path[0]
    if (typeof field === 'string' && FIELDS.includes(field)) {
      errors[field as AddPersonField] ??= issue.message
    }
  }
  return errors
}
