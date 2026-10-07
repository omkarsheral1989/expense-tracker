import { DownloadOutlined, ExclamationCircleFilled } from '@ant-design/icons'
import { Button, Card, Flex, Steps, theme, Typography } from 'antd'
import { useColorScheme } from '../../../../hooks/useColorScheme'
import type { Platform } from '../../../../pwa/platform.ts'
import { IOS_STEPS } from './content.ts'
import { WARNING_ICON_COLOR } from './style.ts'

const { Title, Paragraph, Text } = Typography

type Props = {
  platform: Platform
  /**
   * Whether installing is *required* before the user can sign in ("gated" means
   * sign-in is locked behind installing the app).
   *
   * When true:
   * - the card is the page's main call to action: warning icon, the heading
   *   "Install OwnLedger first", and a "Continue in browser anyway" link;
   * - the Sign in button is not shown anywhere on the page.
   *
   * When false, installing is only a suggestion: the heading is just "Install
   * OwnLedger" with a download icon, there is no skip link, and the Sign in
   * button is visible next to the card.
   *
   * It is true only on iPhone/iPad, for an app that is not installed yet and
   * has not been skipped, and only while VITE_REQUIRE_INSTALL is not "false".
   * The reason: an installed iOS app has its own storage, separate from the
   * browser's, so data entered in a browser tab would not carry over. The value
   * is worked out in the welcome page (`pages/welcome/index.tsx`).
   */
  gated: boolean
  /**
   * Whether the browser has offered a built-in install prompt that the app can
   * trigger from its own button.
   *
   * When true (Chrome and Edge on Android and desktop, after the browser has
   * fired its `beforeinstallprompt` event), the card shows an "Install app"
   * button that calls `onInstall` and opens the browser's install dialog.
   *
   * When false, the card cannot install anything itself and only shows a hint
   * about where to find "Install" in the browser's menu. This is always the
   * case on iPhone/iPad (Safari has no install prompt, so the card shows the
   * Share, "Add to Home Screen" steps instead) and in browsers without install
   * support such as Firefox. It is also false once the prompt has been used,
   * because a browser prompt can only be shown once.
   *
   * It comes from `useInstall()` (`hooks/useInstall`).
   */
  canPrompt: boolean
  onInstall: () => void
  onSkip: () => void
}

export function InstallCard({
  platform,
  gated,
  canPrompt,
  onInstall,
  onSkip,
}: Props) {
  const { token } = theme.useToken()
  const scheme = useColorScheme()

  // A warning while the install is required, a plain cue when optional.
  function renderIcon() {
    return gated ? (
      <ExclamationCircleFilled
        aria-label="Action needed"
        style={{ color: WARNING_ICON_COLOR[scheme], fontSize: 24 }}
      />
    ) : (
      <DownloadOutlined
        aria-hidden="true"
        style={{ color: token.colorPrimary, fontSize: 24 }}
      />
    )
  }

  function renderIosInstructions() {
    return (
      <>
        <Steps
          orientation="vertical"
          size="small"
          current={-1}
          // These steps are required, so they must not look greyed out
          // like upcoming steps do by default.
          styles={{
            itemIcon: { background: token.colorPrimary, color: '#fff' },
            itemTitle: { color: token.colorText, fontWeight: 600 },
            itemContent: { color: token.colorText },
            itemRail: { background: token.colorPrimary },
          }}
          items={IOS_STEPS.map(({ title, content }) => ({
            title,
            content,
          }))}
        />
        <Text type="secondary">
          Why? On iPhone, the installed app keeps its own storage. Data entered
          in a browser tab wouldn&apos;t carry over.
        </Text>
        {gated && (
          <div>
            <Button type="link" style={{ padding: 0 }} onClick={onSkip}>
              Continue in browser anyway
            </Button>
          </div>
        )}
      </>
    )
  }

  // Android and desktop: the native install button when the browser offers
  // one, otherwise a hint about where to find "install" in the browser.
  function renderBrowserInstructions() {
    if (canPrompt) {
      return (
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
      )
    }

    return (
      <Text>
        {platform === 'android'
          ? 'Open the browser menu (⋮) and choose Install app or Add to Home screen.'
          : 'Look for the install icon in the address bar, or open the browser menu and choose Install OwnLedger. Not every browser supports installing.'}
      </Text>
    )
  }

  function renderHeading() {
    return (
      <div>
        <Flex align="center" gap={10}>
          {renderIcon()}
          <Title level={3} style={{ margin: 0 }}>
            {gated ? 'Install OwnLedger first' : 'Install OwnLedger'}
          </Title>
        </Flex>
        <Paragraph style={{ margin: '4px 0 0' }}>
          Add it to your home screen so it works like a regular app, even
          offline.
        </Paragraph>
      </div>
    )
  }

  // The card sits inside the hero, whose text is centred, so the wrapper resets
  // the alignment. `scrollMarginTop` leaves room above it when a link scrolls here.
  return (
    <div
      id="install"
      style={{ width: '100%', textAlign: 'left', scrollMarginTop: 16 }}
    >
      <Card
        style={{
          maxWidth: 640,
          margin: '0 auto',
          borderColor: token.colorPrimary,
          background: token.colorPrimaryBg,
        }}
      >
        <Flex vertical gap={16}>
          {renderHeading()}
          {platform === 'ios'
            ? renderIosInstructions()
            : renderBrowserInstructions()}
        </Flex>
      </Card>
    </div>
  )
}
