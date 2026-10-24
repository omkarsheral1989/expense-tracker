import { Button, Tooltip } from 'antd'
import type { ReactNode } from 'react'
import { ComingSoon } from '../ComingSoon'
import { CONTROL_HEIGHT } from '../../theme/controlHeight.ts'
import { PILL_RADIUS } from '../../theme/radius.ts'

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
  /** The chip is switched off for now, without a tip (what it needs is still loading). */
  disabled?: boolean
  /** A tip shown when the pointer rests on the chip, for a chip whose text is short for something longer. */
  tip?: string
  /** The text's size in pixels; leave out for the button's own. */
  fontSize?: number
}

/** A translucent dark pill on the colored band, holding a short fact or an action. */
export function BandChip({ icon, children, onClick, comingSoon, disabled, tip, fontSize }: Props) {
  const chip = (
    <Button
      type="text"
      size="small"
      icon={icon}
      disabled={comingSoon || disabled}
      onClick={onClick}
      // A chip with no action only shows information, so it is not clickable.
      style={{
        padding: '0 14px',
        // A one-character chip (a currency symbol) is a circle, not a narrower pill.
        minWidth: CONTROL_HEIGHT,
        fontSize,
        borderRadius: PILL_RADIUS,
        color: '#fff',
        background: 'rgba(0, 0, 0, 0.28)',
        border: '1px solid rgba(255, 255, 255, 0.22)',
        opacity: comingSoon || disabled ? 0.7 : 1,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {children}
    </Button>
  )

  if (comingSoon) return <ComingSoon>{chip}</ComingSoon>
  return tip ? <Tooltip title={tip}>{chip}</Tooltip> : chip
}
