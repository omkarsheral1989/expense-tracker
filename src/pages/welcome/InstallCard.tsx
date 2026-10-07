import { DownloadOutlined, ExclamationCircleFilled } from '@ant-design/icons'
import { Button, Card, Flex, Steps, theme, Typography } from 'antd'
import type { Platform } from '../../pwa/platform.ts'

const { Title, Paragraph, Text } = Typography

type Props = {
  platform: Platform
  /** Sign-in is hidden until the app is installed (iPhone/iPad). */
  gated: boolean
  canPrompt: boolean
  onInstall: () => void
  onSkip: () => void
  /** Rendered inside the hero (full width, left-aligned text) instead of as its own section. */
  embedded?: boolean
}

const IOS_STEPS = [
  {
    title: 'Tap the Share button',
    content:
      "It's the square with an arrow, next to the address bar. If you don't see it, open the browser's menu.",
  },
  { title: 'Choose Add to Home Screen', content: 'Then tap Add.' },
  {
    title: 'Open OwnLedger from your home screen',
    content: 'Sign-in appears there.',
  },
]

export function InstallCard({
  platform,
  gated,
  canPrompt,
  onInstall,
  onSkip,
  embedded,
}: Props) {
  const { token } = theme.useToken()

  const Wrapper = embedded ? 'div' : 'section'
  const wrapperStyle = embedded
    ? { width: '100%', textAlign: 'left' as const, scrollMarginTop: 16 }
    : { padding: '32px 16px 0', scrollMarginTop: 16 }

  return (
    <Wrapper id="install" style={wrapperStyle}>
      <Card
        style={{
          maxWidth: 640,
          margin: '0 auto',
          borderColor: token.colorPrimary,
          background: token.colorPrimaryBg,
        }}
      >
        <Flex vertical gap={16}>
          <div>
            <Flex align="center" gap={10}>
              {/* A warning while the install is required, a plain cue when optional. */}
              {gated ? (
                <ExclamationCircleFilled
                  aria-label="Action needed"
                  style={{ color: token.colorWarning, fontSize: 24 }}
                />
              ) : (
                <DownloadOutlined
                  aria-hidden="true"
                  style={{ color: token.colorPrimary, fontSize: 24 }}
                />
              )}
              <Title level={3} style={{ margin: 0 }}>
                {gated ? 'Install OwnLedger first' : 'Install OwnLedger'}
              </Title>
            </Flex>
            <Paragraph style={{ margin: '4px 0 0' }}>
              Add it to your home screen so it works like a regular app, even
              offline.
            </Paragraph>
          </div>

          {platform === 'ios' ? (
            <>
              <Steps
                orientation="vertical"
                size="small"
                current={-1}
                items={IOS_STEPS.map(({ title, content }) => ({
                  title,
                  content,
                }))}
              />
              <Text type="secondary">
                Why? On iPhone, the installed app keeps its own storage. Data
                entered in a browser tab wouldn&apos;t carry over.
              </Text>
              {gated && (
                <div>
                  <Button type="link" style={{ padding: 0 }} onClick={onSkip}>
                    Continue in browser anyway
                  </Button>
                </div>
              )}
            </>
          ) : canPrompt ? (
            <div>
              <Button
                type="primary"
                size="large"
                icon={<DownloadOutlined />}
                onClick={onInstall}
              >
                Install app
              </Button>
            </div>
          ) : (
            <Text>
              {platform === 'android'
                ? 'Open the browser menu (⋮) and choose Install app or Add to Home screen.'
                : 'Look for the install icon in the address bar, or open the browser menu and choose Install OwnLedger. Not every browser supports installing.'}
            </Text>
          )}
        </Flex>
      </Card>
    </Wrapper>
  )
}
