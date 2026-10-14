import { Flex } from 'antd'
import type { ReactNode } from 'react'

type Props = {
  children: ReactNode
  /**
   * Space kept free below the message, for something that floats over the bottom
   * of the screen (see `ABOVE_FLOATING_BUTTON`). The message is centered in what
   * is left above it. Leave out when nothing floats there.
   */
  roomBelow?: number
}

/**
 * A full-page message (not found, couldn't load, open in another tab) centered
 * vertically and horizontally. It fills what the page's column has left below
 * the header, or the whole screen on a page with no header, and keeps to the
 * same 720 px column as the other pages. The page it sits in must be a column
 * that fills the screen, which the signed-in layout is.
 */
export function CenteredMessage({ children, roomBelow = 0 }: Props) {
  return (
    <Flex
      vertical
      align="center"
      justify="center"
      style={{
        flex: 1,
        width: '100%',
        maxWidth: 720,
        margin: '0 auto',
        padding: `0 16px ${roomBelow}px`,
      }}
    >
      {children}
    </Flex>
  )
}
