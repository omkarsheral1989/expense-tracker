import { LogoutOutlined, TeamOutlined } from '@ant-design/icons'
import { Button, Dropdown, Flex, Typography, theme } from 'antd'
import { Link, useNavigate } from 'react-router'
import { ROUTES } from '../../routes.ts'
import type { Profile } from '../../services/googleProfileService/types.ts'
import { useAuthStore } from '../../stores/useAuthStore'
import { BrandLogo } from '../BrandLogo'
import { ProfileAvatar } from '../ProfileAvatar'
import { SyncButton } from '../SyncButton'
import { GuestMenu } from './GuestMenu'

const { Text } = Typography

/**
 * The bar at the top of every page of the app: the logo and name on the left,
 * which lead back to the home page, and on the right the Sync button and the
 * user's avatar, which opens a menu with their name, email and Sign out (or,
 * for a guest, "Guest", Sign in with Google and Exit guest mode). Sync appears
 * once the data is open.
 */
export function AppHeader() {
  const profile = useAuthStore((state) => state.profile)
  const guest = useAuthStore((state) => state.guest)
  const signOut = useAuthStore((state) => state.signOut)
  const { token } = theme.useToken()
  const navigate = useNavigate()

  // Visitors who are not in the app are sent away by `RequireAuth` before this matters.
  if (!profile && !guest) return null

  function renderBrand() {
    return (
      <Link
        to={ROUTES.home}
        style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'inherit' }}
      >
        <BrandLogo size={56} onPrimary />
        <Text strong style={{ fontSize: 24, color: '#fff' }}>
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
              key: 'members',
              icon: <TeamOutlined />,
              label: 'Group members',
              onClick: () => navigate(ROUTES.members),
            },
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
        boxSizing: 'border-box',
        height: 80,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        background: token.colorPrimary,
      }}
    >
      <Flex
        justify="space-between"
        align="center"
        style={{ width: '100%', maxWidth: 960, margin: '0 auto' }}
      >
        {renderBrand()}
        <Flex align="center" gap={12}>
          <SyncButton />
          {profile ? renderAccountMenu(profile) : <GuestMenu />}
        </Flex>
      </Flex>
    </header>
  )
}
