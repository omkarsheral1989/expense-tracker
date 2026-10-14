import { z } from 'zod'
import { GROUP_NAME_MAX_LENGTH, GROUP_TYPES } from '../../db/constants.ts'
import { currencyService } from '../currencyService'
import type { CreateGroupErrors, CreateGroupField } from './types.ts'

/**
 * The rules for a new group. The form and the save function share it.
 * Parsing also cleans the input: the name is trimmed, and a member chosen
 * twice counts once.
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
  memberIds: z
    .array(z.uuid({ error: 'Choose members from the list.' }), { error: 'Choose members from the list.' })
    .transform((ids) => [...new Set(ids)]),
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
