import { Button } from 'antd'
import type { ReactNode } from 'react'
import { ComingSoon } from '../../../../../components/ComingSoon'
import { PILL_RADIUS } from '../../../../../theme/radius.ts'

type Props = {
  icon?: ReactNode
  children: ReactNode
  /**
   * What happens when the chip is pressed. Leave out, together with `comingSoon`
   * off, for a chip that only shows information.
   */
  onClick?: () => void
  /** The chip's feature is not built yet: it is switched off with a "Coming soon" tip. */
  comingSoon?: boolean
}

/** A translucent dark pill on the colored band, holding a short fact or an action. */
export function BandChip({ icon, children, onClick, comingSoon }: Props) {
  const chip = (
    <Button
      type="text"
      size="small"
      icon={icon}
      disabled={comingSoon}
      onClick={onClick}
      // A chip with no action only shows information, so it is not clickable.
      style={{
        height: 32,
        padding: '0 14px',
        borderRadius: PILL_RADIUS,
        color: '#fff',
        background: 'rgba(0, 0, 0, 0.28)',
        border: '1px solid rgba(255, 255, 255, 0.22)',
        opacity: comingSoon ? 0.7 : 1,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {children}
    </Button>
  )

  return comingSoon ? <ComingSoon>{chip}</ComingSoon> : chip
}
