import { Avatar, Button, Card, Flex, Typography } from 'antd'
import { useAuth } from '../../auth/authStore.ts'

const { Title, Text } = Typography

/** Placeholder until the real home page (group list) is built. */
export function HomePage() {
  const profile = useAuth((state) => state.profile)
  const signOut = useAuth((state) => state.signOut)

  if (!profile) return null

  return (
    <Flex justify="center" style={{ padding: '64px 16px' }}>
      <Card style={{ width: '100%', maxWidth: 420 }}>
        <Flex vertical align="center" gap={12} style={{ textAlign: 'center' }}>
          <Avatar
            size={72}
            src={
              profile.picture ? (
                <img src={profile.picture} alt="" referrerPolicy="no-referrer" />
              ) : undefined
            }
          >
            {profile.name.charAt(0).toUpperCase()}
          </Avatar>
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
