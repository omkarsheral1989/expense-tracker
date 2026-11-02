import { Button, Typography } from 'antd'
import type { ReactNode } from 'react'
import { useAppNavigate } from '../../../../hooks/useAppNavigate'
import { ROUTES } from '../../../../routes.ts'

const { Text, Link } = Typography

type Props = {
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

/** What the welcome page adds under the hero's highlights: the install card, Open OwnLedger and the sign-in note. */
export function StartActions({ gated, installCard }: Props) {
  const navigate = useAppNavigate()

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
    <>
      {installCard}
      {/* While gated, the install card above is the call to action. */}
      {!gated && (
        <Button type="primary" size="large" onClick={() => navigate(ROUTES.getStarted)}>
          Open OwnLedger
        </Button>
      )}
      {renderDriveNote()}
    </>
  )
}
