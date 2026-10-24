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
  /** Marks the chip, and its text inside it, as pieces that travel between a group's row and its page (PRD 5.16): `currency` or `people`. */
  vt?: string
}

/** A translucent dark pill on the colored band, holding a short fact or an action. */
export function BandChip({ icon, children, onClick, comingSoon, disabled, tip, fontSize, vt }: Props) {
  const chip = (
    <Button
      type="text"
      size="small"
      // On the members chip the icon is a piece of its own, which the row's empty 0 x 0 px piece grows into (PRD 5.16).
      icon={vt === 'people' && icon ? <span data-vt="peopleIcon" style={{ display: 'inline-flex' }}>{icon}</span> : icon}
      disabled={comingSoon || disabled}
      onClick={onClick}
      // The pill is a piece too, which a plain box around the text in a group's row grows into (PRD 5.16).
      data-vt={vt ? `${vt}Chip` : undefined}
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
      {/* The text alone is the piece that travels from a group's row (PRD 5.16), not the pill around it. */}
      {vt ? (
        <span data-vt={vt} style={{ display: 'inline-block' }}>
          {children}
        </span>
      ) : (
        children
      )}
    </Button>
  )

  if (comingSoon) return <ComingSoon>{chip}</ComingSoon>
  return tip ? <Tooltip title={tip}>{chip}</Tooltip> : chip
}
