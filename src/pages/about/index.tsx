import { Flex, Typography } from 'antd'
import { AppInfo } from '../../components/AppInfo'
import { BackButton } from '../../components/BackButton'
import { useAppNavigate } from '../../hooks/useAppNavigate'
import { ROUTES } from '../../routes.ts'
import { HEADER_TOP_PADDING, belowStatusBar } from '../../theme/safeArea.ts'
import { HEADER_TITLE_STYLE } from '../../theme/headerTitle.ts'
import { APP_VERSION } from '../../version.ts'

const { Title } = Typography

/**
 * What the app is, as the welcome page tells it (without installing or starting), and which
 * version this is. Opened from the name in the avatar menu (PRD 5.24).
 */
export function AboutPage() {
  const navigate = useAppNavigate()

  return (
    <div style={{ position: 'relative' }}>
      <title>About · OwnLedger</title>
      {/* Over the hero's gradient, in the room its top padding leaves. */}
      <Flex
        align="center"
        gap={12}
        style={{
          position: 'absolute',
          insetInline: 0,
          top: 0,
          zIndex: 1,
          maxWidth: 720,
          margin: '0 auto',
          padding: `${belowStatusBar(HEADER_TOP_PADDING)} 16px 0`,
        }}
      >
        <BackButton onClick={() => navigate(ROUTES.home, { direction: 'back' })} />
        <Title level={3} style={HEADER_TITLE_STYLE}>
          About
        </Title>
      </Flex>
      <AppInfo version={APP_VERSION} />
    </div>
  )
}
