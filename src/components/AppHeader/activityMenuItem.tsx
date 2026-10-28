import { Icon } from '../Icon'
import { Flex } from 'antd'
import type { MenuProps } from 'antd'
import { ROUTES } from '../../routes.ts'
import { UnreadDot } from '../UnreadDot'

/** The "Activity" entry of the avatar menu, with the unread dot to its left while something is new (PRD 5.18). */
export function activityMenuItem(unread: boolean, open: (path: string) => void): NonNullable<MenuProps['items']>[number] {
  return {
    key: 'activity',
    icon: <Icon name="bell" />,
    label: (
      <Flex align="center" gap={8}>
        {unread && <UnreadDot />}
        Activity
      </Flex>
    ),
    onClick: () => open(ROUTES.activity),
  }
}
