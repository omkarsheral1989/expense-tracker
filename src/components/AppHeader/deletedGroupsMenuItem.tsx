import { Icon } from '../Icon'
import type { MenuProps } from 'antd'
import { DELETE_GROUP_ENABLED } from '../../features.ts'
import { ROUTES } from '../../routes.ts'

/** The "Deleted groups" entry of the avatar menu, below "Accounts" (PRD 5.23): an empty list unless the feature is turned on. */
export function deletedGroupsMenuItems(open: (path: string) => void): NonNullable<MenuProps['items']> {
  if (!DELETE_GROUP_ENABLED) return []
  return [{ key: 'deleted-groups', icon: <Icon name="trash" />, label: 'Deleted groups', onClick: () => open(ROUTES.deletedGroups) }]
}
