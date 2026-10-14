import type { FormInstance } from 'antd'
import type { CreateGroupErrors } from '../../../../services/groupService/types.ts'
import type { FormValues } from './types.ts'

/** What `form.setFields` takes: a name and its messages for each field. */
type FieldData = Parameters<FormInstance['setFields']>[0][number]

const FIELDS = ['name', 'type', 'defaultCurrency'] as const

/**
 * Whether the user has changed anything since the form opened. Used to decide
 * if Save does anything and if leaving needs a "Discard your changes?" question.
 * Extra spaces around the name do not count as a change.
 */
export function hasChanges(values: Partial<FormValues> | undefined, initial: FormValues): boolean {
  if (!values) return false

  return (
    (values.name ?? '').trim() !== initial.name.trim() ||
    values.type !== initial.type ||
    values.defaultCurrency !== initial.defaultCurrency
  )
}

/**
 * Turns the service's messages into what the form needs: the message under each
 * field that has a problem, and none under the others, so a fixed problem disappears.
 */
export function toFormFields(errors: CreateGroupErrors): FieldData[] {
  return FIELDS.map((name) => ({
    name,
    errors: errors[name] ? [errors[name]] : [],
  }))
}
