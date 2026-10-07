import type { FormInstance } from 'antd'
import type { CreateGroupErrors } from '../../../../services/groupService/types.ts'
import type { FormValues } from './types.ts'

/** What `form.setFields` takes: a name and its messages for each field. */
type FieldData = Parameters<FormInstance['setFields']>[0][number]

const FIELDS = ['name', 'type', 'defaultCurrency', 'memberEmails'] as const

/**
 * Whether the user has typed or changed anything since the form opened. Used to
 * decide if leaving needs a "Discard this group?" confirmation.
 */
export function hasUnsavedInput(
  values: Partial<FormValues> | undefined,
  initial: FormValues,
): boolean {
  if (!values) return false

  return (
    (values.name ?? '').trim() !== '' ||
    values.type !== initial.type ||
    values.defaultCurrency !== initial.defaultCurrency ||
    (values.memberEmails ?? []).length > 0
  )
}

/**
 * Turns the service's messages into what the form needs: the message under each
 * field that has a problem, and no message under the others, so a problem that
 * has been fixed disappears.
 */
export function toFormFields(errors: CreateGroupErrors): FieldData[] {
  return FIELDS.map((name) => ({
    name,
    errors: errors[name] ? [errors[name]] : [],
  }))
}
