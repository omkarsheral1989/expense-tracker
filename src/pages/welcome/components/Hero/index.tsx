import { Flex, theme, Typography } from 'antd'
import type { ReactNode } from 'react'
import { BrandLogo } from '../../../../components/BrandLogo'
import { HIGHLIGHTS, type Highlight } from './content.tsx'
import { SignInButton } from './SignInButton'

const { Title, Paragraph, Text, Link } = Typography

type HeroProps = {
  /**
   * Whether signing in is locked until the app is installed (iPhone/iPad only;
   * see `gated` on `InstallCard`). When true the Sign in button is not shown,
   * because the install card is the call to action instead.
   */
  gated: boolean
  /**
   * The install card, shown just above the Sign in button. Leave it out once
   * the app is installed.
   */
  installCard?: ReactNode
}

export function Hero({ gated, installCard }: HeroProps) {
  const { token } = theme.useToken()

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
        OwnLedger uses your Google Drive to back up and share your groups.
        Nothing is sent to our servers.{' '}
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
        {!gated && <SignInButton />}
        {renderDriveNote()}
      </Flex>
    </header>
  )
}
