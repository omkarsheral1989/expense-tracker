import {
  GithubOutlined,
  LockOutlined,
  TeamOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import { Flex, theme, Typography } from 'antd'
import type { ReactNode } from 'react'
import { SignInButton } from './SignInButton.tsx'

const { Title, Paragraph, Text, Link } = Typography

const HIGHLIGHTS: { icon: ReactNode; text: string }[] = [
  {
    icon: <TeamOutlined />,
    text: 'Track your own spending and share costs with trips, homes and partners.',
  },
  {
    icon: <LockOutlined />,
    text: 'Works offline, and your data stays with you.',
  },
  { icon: <GithubOutlined />, text: 'Free and open source.' },
]

export function Hero() {
  const { token } = theme.useToken()

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
        <Flex
          align="center"
          justify="center"
          style={{
            width: 80,
            height: 80,
            borderRadius: 24,
            fontSize: 40,
            color: '#fff',
            background: `linear-gradient(135deg, ${token.colorPrimary}, #34d399)`,
            boxShadow: token.boxShadowSecondary,
          }}
        >
          <WalletOutlined />
        </Flex>

        <Title level={1} style={{ margin: 0, fontSize: 'clamp(2.25rem, 8vw, 3.5rem)' }}>
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

        <Flex vertical gap={12} style={{ maxWidth: 460, textAlign: 'left' }}>
          {HIGHLIGHTS.map(({ icon, text }) => (
            <Flex key={text} gap={12} align="flex-start">
              <span
                style={{ color: token.colorPrimary, fontSize: 18, lineHeight: '26px' }}
              >
                {icon}
              </span>
              <Paragraph style={{ margin: 0, fontSize: 16 }}>{text}</Paragraph>
            </Flex>
          ))}
        </Flex>

        <SignInButton />

        <Text type="secondary" style={{ maxWidth: 440, fontSize: 13 }}>
          OwnLedger uses your Google Drive to back up and share your groups.
          Nothing is sent to our servers.{' '}
          <Link href="#faq">Why does it need Drive?</Link>
        </Text>
      </Flex>
    </header>
  )
}
