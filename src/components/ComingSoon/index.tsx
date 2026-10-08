import { Tooltip } from 'antd'
import type { ReactNode } from 'react'

type Props = {
  /** A control that is switched off (`disabled`) because its feature is not built yet. */
  children: ReactNode
}

/**
 * Shows "Coming soon" when the pointer rests on a switched-off control. A
 * disabled button does not receive pointer events, so the tip is attached to a
 * wrapper around it.
 */
export function ComingSoon({ children }: Props) {
  return (
    <Tooltip title="Coming soon">
      <span style={{ display: 'inline-flex' }}>{children}</span>
    </Tooltip>
  )
}
