import { ArrowLeftOutlined } from '@ant-design/icons'
import { Button, Divider, Flex, Typography } from 'antd'
import { Navigate } from 'react-router'
import { AppLink } from '../../components/AppLink'
import { BrandLogo } from '../../components/BrandLogo'
import { useInstallGate } from '../../hooks/useInstallGate'
import { ROUTES } from '../../routes.ts'
import { useAuthStore } from '../../stores/useAuthStore'
import { aboveScreenEdge, belowStatusBar } from '../../theme/safeArea.ts'
import { GuestButton } from './components/GuestButton'
import { SignInButton } from './components/SignInButton'
import { GET_STARTED_TITLE, SIGN_IN_NOTE } from './content.ts'

const { Title, Text } = Typography

/**
 * Where the welcome page's Open OwnLedger button leads: sign in with Google, or
 * continue as a guest. Either way the user ends up on the home page.
 */
export function GetStartedPage() {
  const inApp = useAuthStore((state) => state.profile !== null || state.guest)
  // Locked behind installing the app on iPhone/iPad, as on the welcome page.
  const { gated } = useInstallGate()

  if (inApp) return <Navigate to={ROUTES.home} replace />
  if (gated) return <Navigate to={ROUTES.welcome} replace />

  return (
    <Flex
      vertical
      align="center"
      gap={16}
      style={{ minHeight: '100dvh', padding: `${belowStatusBar(32)} 16px ${aboveScreenEdge(32)}`, textAlign: 'center' }}
    >
      <title>Open OwnLedger</title>
      <Flex style={{ width: '100%', maxWidth: 400 }}>
        <AppLink direction="back" to={ROUTES.welcome}>
          <Button type="text" icon={<ArrowLeftOutlined />}>
            Back
          </Button>
        </AppLink>
      </Flex>
      <Flex vertical align="center" gap={16} style={{ width: '100%', maxWidth: 400, margin: 'auto 0' }}>
        <BrandLogo size={96} />
        <Title level={2} style={{ margin: 0 }}>
          {GET_STARTED_TITLE}
        </Title>
        <Flex vertical gap={16} style={{ width: '100%' }}>
          <SignInButton />
          <Divider style={{ margin: 0 }}>OR</Divider>
          <GuestButton />
        </Flex>
        <Text type="secondary">{SIGN_IN_NOTE}</Text>
      </Flex>
    </Flex>
  )
}
