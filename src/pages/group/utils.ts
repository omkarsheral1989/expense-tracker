import { GROUP_TYPES } from '../../db/constants.ts'
import type { KnownGroup } from './types.ts'

/**
 * The group the page was opened with (`location.state`), when it is one for
 * this page: the same id and every field the band shows. Anything else, such as
 * a direct link or a state from another page, gives null and the page loads as before.
 */
export function knownGroupFrom(state: unknown, groupId: string): KnownGroup | null {
  const group = (state as { group?: Partial<KnownGroup> } | null)?.group
  if (
    !group ||
    group.id !== groupId ||
    typeof group.name !== 'string' ||
    typeof group.defaultCurrency !== 'string' ||
    typeof group.memberCount !== 'number' ||
    !(GROUP_TYPES as readonly unknown[]).includes(group.type)
  ) {
    return null
  }
  return { id: group.id, name: group.name, type: group.type as KnownGroup['type'], defaultCurrency: group.defaultCurrency, memberCount: group.memberCount }
}
