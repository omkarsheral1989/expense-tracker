import { CreditCardOutlined, LogoutOutlined, TeamOutlined } from '@ant-design/icons'
import { Button, Dropdown, Flex, Typography, theme } from 'antd'
import { useAppNavigate } from '../../hooks/useAppNavigate'
import { useUnreadActivity } from '../../hooks/useUnreadActivity'
import { ROUTES } from '../../routes.ts'
import type { Profile } from '../../services/googleProfileService/types.ts'
import { useAuthStore } from '../../stores/useAuthStore'
import { BrandLogo } from '../BrandLogo'
import { ProfileAvatar } from '../ProfileAvatar'
import { SyncButton } from '../SyncButton'
import { UnreadDot } from '../UnreadDot'
import { activityMenuItem } from './activityMenuItem.tsx'
import { GuestMenu } from './GuestMenu'

const { Text } = Typography

/**
 * The bar at the top of every page of the app: the logo and name on the left,
 * which do nothing when pressed, and on the right the Sync button and the
 * user's avatar, which opens a menu with their name, email and Sign out (or,
 * for a guest, "Guest", Sign in with Google and Exit guest mode). Sync appears
 * once the data is open.
 */
export function AppHeader() {
  const profile = useAuthStore((state) => state.profile)
  const guest = useAuthStore((state) => state.guest)
  const signOut = useAuthStore((state) => state.signOut)
  const { token } = theme.useToken()
  const navigate = useAppNavigate()
  const unread = useUnreadActivity()

  // Visitors who are not in the app are sent away by `RequireAuth` before this matters.
  if (!profile && !guest) return null

  function renderBrand() {
    return (
      <Flex align="center" gap={10}>
        <BrandLogo size={56} onPrimary />
        <Text strong style={{ fontSize: 24, color: '#fff' }}>
          OwnLedger
        </Text>
      </Flex>
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
            activityMenuItem(unread, navigate),
            {
              key: 'members',
              icon: <TeamOutlined />,
              label: 'Group members',
              onClick: () => navigate(ROUTES.members),
            },
            {
              key: 'accounts',
              icon: <CreditCardOutlined />,
              label: 'Accounts',
              onClick: () => navigate(ROUTES.accounts),
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
      // Moves up off the screen when a group opens from the list, and comes back down (PRD 5.16).
      data-app-header
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
          {/* The dot sits on the avatar's top-right corner, ringed in the header's green. */}
          <span style={{ position: 'relative', display: 'inline-flex' }}>
            {profile ? renderAccountMenu(profile) : <GuestMenu />}
            {unread && <UnreadDot ringColor={token.colorPrimary} style={{ position: 'absolute', top: 0, right: 0, pointerEvents: 'none' }} />}
          </span>
        </Flex>
      </Flex>
    </header>
  )
}
