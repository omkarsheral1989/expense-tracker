import { PlusOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import type { ReactNode } from 'react'
import { PILL_RADIUS } from '../../theme/radius.ts'
import { FLOATING_BUTTON_BOTTOM, FLOATING_BUTTON_HEIGHT } from './constants.ts'
import { aboveScreenEdge } from '../../theme/safeArea.ts'

type Props = {
  /** The label, such as "Add expense". */
  children: ReactNode
  onClick: () => void
}

/**
 * The floating green pill with a plus that a page's main action uses ("Add
 * expense", "Create group"). It stays at the bottom of the screen, lined up with
 * the right edge of the 720 px content column (or 16 px from the screen's edge on
 * a phone). A page leaves `FLOATING_BUTTON_ROOM` below a list so the last row is
 * not hidden behind it, and ends an empty message `ABOVE_FLOATING_BUTTON` above
 * the bottom of the screen (see constants.ts).
 */
export function FloatingPillButton({ children, onClick }: Props) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: aboveScreenEdge(FLOATING_BUTTON_BOTTOM),
        right: 'max(16px, calc((100vw - 720px) / 2 + 16px))',
        zIndex: 10,
      }}
    >
      <Button
        type="primary"
        size="large"
        icon={<PlusOutlined />}
        onClick={onClick}
        style={{
          // Taller than other buttons (40 px), with larger text and more padding.
          height: FLOATING_BUTTON_HEIGHT,
          paddingInline: 24,
          fontSize: 16,
          borderRadius: PILL_RADIUS,
          boxShadow: '0 6px 16px rgba(0, 0, 0, 0.2)',
        }}
      >
        {children}
      </Button>
    </div>
  )
}
