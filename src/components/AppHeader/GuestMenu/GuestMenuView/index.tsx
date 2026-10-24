import { LogoutOutlined, TeamOutlined } from '@ant-design/icons'
import { Button, Dropdown, Flex, Typography } from 'antd'
import { useAppNavigate } from '../../../../hooks/useAppNavigate'
import { ROUTES } from '../../../../routes.ts'
import { userService } from '../../../../services/userService'
import { useAuthStore } from '../../../../stores/useAuthStore'
import { GoogleLogo } from '../../../GoogleLogo'
import { ProfileAvatar } from '../../../ProfileAvatar'

const { Text } = Typography

type Props = {
  /** Starts the Google sign-in, which makes that account the owner of this device's data. */
  onSignIn: () => void
  loading?: boolean
}

/**
 * The avatar menu of a guest: who they are ("Guest"), that their data is only
 * on this device, "Sign in with Google" (to back up and share) and "Exit guest
 * mode" (back to the welcome page; the data stays, and Continue as a guest
 * opens it again).
 */
export function GuestMenuView({ onSignIn, loading }: Props) {
  const exitGuestMode = useAuthStore((state) => state.signOut)
  const navigate = useAppNavigate()

  return (
    <Dropdown
      trigger={['click']}
      placement="bottomRight"
      menu={{
        items: [
          {
            key: 'account',
            // Shows who is using the app; there is nothing to choose here.
            label: (
              <Flex vertical>
                <Text strong>{userService.guestName}</Text>
                <Text type="secondary">Your data is only on this device</Text>
              </Flex>
            ),
            style: { cursor: 'default' },
          },
          { type: 'divider' },
          {
            key: 'members',
            icon: <TeamOutlined />,
            label: 'Group members',
            onClick: () => navigate(ROUTES.members),
          },
          {
            key: 'sign-in',
            // Wrapped like an Ant Design icon, so the menu spaces it from the text.
            icon: (
              <span className="anticon">
                <GoogleLogo size={14} />
              </span>
            ),
            label: 'Sign in with Google',
            disabled: loading,
            onClick: onSignIn,
          },
          {
            key: 'exit',
            icon: <LogoutOutlined />,
            label: 'Exit guest mode',
            onClick: exitGuestMode,
          },
        ],
      }}
    >
      <Button type="text" shape="circle" aria-label="Account menu" style={{ padding: 0 }}>
        <ProfileAvatar profile={{ name: userService.guestName }} />
      </Button>
    </Dropdown>
  )
}
