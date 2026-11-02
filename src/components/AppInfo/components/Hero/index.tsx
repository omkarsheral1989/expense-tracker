import { Flex, theme, Typography } from 'antd'
import type { ReactNode } from 'react'
import { BrandLogo } from '../../../BrandLogo'
import { HIGHLIGHTS, type Highlight } from './content.tsx'

const { Title, Paragraph, Text } = Typography

type HeroProps = {
  /** The app's version, shown under its name (the About page); left out on the welcome page. */
  version?: string
  /**
   * What sits under the highlight lines: on the welcome page the install card, the Open OwnLedger
   * button and the sign-in note. The About page has nothing there.
   */
  children?: ReactNode
}

export function Hero({ version, children }: HeroProps) {
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
        {version && <Text type="secondary">Version {version}</Text>}
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
        {children}
      </Flex>
    </header>
  )
}
