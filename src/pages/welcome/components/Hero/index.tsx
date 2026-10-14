import { Button, Flex, theme, Typography } from 'antd'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { BrandLogo } from '../../../../components/BrandLogo'
import { HIGHLIGHTS, type Highlight } from './content.tsx'
import { ROUTES } from '../../../../routes.ts'

const { Title, Paragraph, Text, Link } = Typography

type HeroProps = {
  /**
   * Whether getting started is locked until the app is installed (iPhone/iPad
   * only; see `gated` on `InstallCard`). When true the Open OwnLedger button is
   * not shown, because the install card is the call to action instead.
   */
  gated: boolean
  /**
   * The install card, shown just above the Open OwnLedger button. Leave it out once
   * the app is installed.
   */
  installCard?: ReactNode
}

export function Hero({ gated, installCard }: HeroProps) {
  const { token } = theme.useToken()
  const navigate = useNavigate()

  function renderTitles() {
    return (
      <>
        <Title
          level={1}
          style={{ margin: 0, fontSize: 'clamp(2.25rem, 8vw, 3.5rem)' }}
        >
          OwnLedger
        </Title>
        <Title
          level={2}
          type="secondary"
          style={{
            margin: 0,
            fontWeight: 500,
            fontSize: 'clamp(1.1rem, 4vw, 1.5rem)',
            textWrap: 'balance',
          }}
        >
          Split expenses with friends. Keep your data.
        </Title>
      </>
    )
  }

  function renderHighlight({ icon, text }: Highlight) {
    return (
      <Flex key={text} gap={12} align="flex-start">
        <span
          style={{ color: token.colorPrimary, fontSize: 18, lineHeight: '26px' }}
        >
          {icon}
        </span>
        <Paragraph style={{ margin: 0, fontSize: 16 }}>{text}</Paragraph>
      </Flex>
    )
  }

  function renderDriveNote() {
    return (
      <Text type="secondary" style={{ maxWidth: 440, fontSize: 13 }}>
        No account needed. Sign in with Google to back up and share your
        groups through your Google Drive. Nothing is sent to our servers.{' '}
        <Link href="#faq">Why does it need Drive?</Link>
      </Text>
    )
  }

  return (
    <header
      style={{
        padding: '72px 16px 56px',
        background: `linear-gradient(160deg, color-mix(in srgb, ${token.colorPrimary} 22%, ${token.colorBgContainer}) 0%, ${token.colorBgLayout} 100%)`,
      }}
    >
      <Flex
        vertical
        align="center"
        gap={20}
        style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center' }}
      >
        <BrandLogo size={128} />
        {renderTitles()}
        <Flex vertical gap={12} style={{ maxWidth: 460, textAlign: 'left' }}>
          {HIGHLIGHTS.map(renderHighlight)}
        </Flex>
        {installCard}
        {/* While gated, the install card above is the call to action. */}
        {!gated && (
          <Button type="primary" size="large" onClick={() => navigate(ROUTES.getStarted)}>
            Open OwnLedger
          </Button>
        )}
        {renderDriveNote()}
      </Flex>
    </header>
  )
}
