import { LogoutOutlined } from '@ant-design/icons'
import { Button, Dropdown, Flex, Typography, theme } from 'antd'
import { Link } from 'react-router'
import { ROUTES } from '../../routes.ts'
import type { Profile } from '../../services/googleProfileService/types.ts'
import { useAuthStore } from '../../stores/useAuthStore'
import { BrandLogo } from '../BrandLogo'
import { ProfileAvatar } from '../ProfileAvatar'
import { GuestMenu } from './GuestMenu'

const { Text } = Typography

/**
 * The bar at the top of every page of the app: the logo and name on the left,
 * which lead back to the home page, and the user's avatar on the right, which
 * opens a menu with their name, email and Sign out (or, for a guest, "Guest",
 * Sign in with Google and Exit guest mode).
 */
export function AppHeader() {
  const profile = useAuthStore((state) => state.profile)
  const guest = useAuthStore((state) => state.guest)
  const signOut = useAuthStore((state) => state.signOut)
  const { token } = theme.useToken()

  // Visitors who are not in the app are sent away by `RequireAuth` before this matters.
  if (!profile && !guest) return null

  function renderBrand() {
    return (
      <Link
        to={ROUTES.home}
        style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'inherit' }}
      >
        <BrandLogo size={32} />
        <Text strong style={{ fontSize: 18 }}>
          OwnLedger
        </Text>
      </Link>
    )
  }

  function renderAccountMenu(profile: Profile) {
    const { name, email } = profile

    return (
      <Dropdown
        trigger={['click']}
        placement="bottomRight"
        menu={{
          items: [
            {
              key: 'account',
              // Shows who is signed in; there is nothing to choose here.
              label: (
                <Flex vertical>
                  <Text strong>{name}</Text>
                  <Text type="secondary">{email}</Text>
                </Flex>
              ),
              style: { cursor: 'default' },
            },
            { type: 'divider' },
            {
              key: 'sign-out',
              icon: <LogoutOutlined />,
              label: 'Sign out',
              onClick: signOut,
            },
          ],
        }}
      >
        <Button
          type="text"
          shape="circle"
          aria-label="Account menu"
          style={{ padding: 0 }}
        >
          <ProfileAvatar profile={profile} />
        </Button>
      </Dropdown>
    )
  }

  return (
    <header
      style={{
        padding: '10px 16px',
        background: token.colorBgContainer,
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
      }}
    >
      <Flex
        justify="space-between"
        align="center"
        style={{ maxWidth: 960, margin: '0 auto' }}
      >
        {renderBrand()}
        {profile ? renderAccountMenu(profile) : <GuestMenu />}
      </Flex>
    </header>
  )
}
