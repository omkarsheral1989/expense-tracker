import { Icon } from '../Icon'
import type { MenuProps } from 'antd'
import { ROUTES } from '../../routes.ts'

/** The "Deleted groups" entry of the avatar menu, below "Accounts" (PRD 5.23). Always there: the flag only hides the Delete button (PRD 5.22). */
export function deletedGroupsMenuItems(open: (path: string) => void): NonNullable<MenuProps['items']> {
  return [{ key: 'deleted-groups', icon: <Icon name="trash" />, label: 'Deleted groups', onClick: () => open(ROUTES.deletedGroups) }]
}
