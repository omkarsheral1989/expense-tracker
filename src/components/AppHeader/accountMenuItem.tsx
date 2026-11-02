import { Icon } from '../Icon'
import { Flex, Typography } from 'antd'
import type { MenuProps } from 'antd'
import type { ReactNode } from 'react'
import { ROUTES } from '../../routes.ts'

const { Text } = Typography

/**
 * The first entry of the avatar menu: who is using the app, with a small arrow.
 * Pressing it opens the About page (PRD 5.24).
 */
export function accountMenuItem(
  name: ReactNode,
  detail: ReactNode,
  open: (path: string) => void,
): NonNullable<MenuProps['items']>[number] {
  return {
    key: 'account',
    label: (
      <Flex align="center" justify="space-between" gap={12}>
        <Flex vertical>
          <Text strong>{name}</Text>
          <Text type="secondary">{detail}</Text>
        </Flex>
        <Icon name="chevronRight" />
      </Flex>
    ),
    onClick: () => open(ROUTES.about),
  }
}
