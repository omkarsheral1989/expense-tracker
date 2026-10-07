import type { CreateGroupInput } from '../../../../services/groupService/types.ts'

/**
 * What the form holds. The currency can be empty: it is preselected from the
 * device's region, and when that is unknown the user has to choose one.
 */
export type FormValues = Omit<CreateGroupInput, 'defaultCurrency'> & {
  defaultCurrency?: string
}
