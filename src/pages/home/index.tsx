import { Avatar, Button, Card, Flex, Typography } from 'antd'
import { useAuthStore } from '../../stores/useAuthStore'
import type { Profile } from '../../services/googleProfileService/types.ts'

const { Title, Text } = Typography

/** Placeholder until the real home page (group list) is built. */
export function HomePage() {
  const profile = useAuthStore((state) => state.profile)
  const signOut = useAuthStore((state) => state.signOut)

  if (!profile) return null

  // Google profile pictures only load without a referrer; the first letter of
  // the name is shown when there is no picture or it fails to load.
  function renderAvatar({ name, picture }: Profile) {
    return (
      <Avatar
        size={72}
        src={
          picture ? (
            <img src={picture} alt="" referrerPolicy="no-referrer" />
          ) : undefined
        }
      >
        {name.charAt(0).toUpperCase()}
      </Avatar>
    )
  }

  return (
    <Flex justify="center" style={{ padding: '64px 16px' }}>
      <Card style={{ width: '100%', maxWidth: 420 }}>
        <Flex vertical align="center" gap={12} style={{ textAlign: 'center' }}>
          {renderAvatar(profile)}
          <Title level={3} style={{ margin: 0 }}>
            Signed in as {profile.name}
          </Title>
          <Text type="secondary">{profile.email}</Text>
          <Text type="secondary">
            Your groups will appear here. Signing out keeps your data on this
            device.
          </Text>
          <Button onClick={signOut}>Sign out</Button>
        </Flex>
      </Card>
    </Flex>
  )
}
