import type { CSSProperties } from 'react'

type Props = {
  /** The color of the ring around the dot, so it stands out from what it sits on. */
  ringColor?: string
  style?: CSSProperties
}

/** Ant Design's volcano 6: a red-orange that reads on the header's green and in the menu, light and dark. */
const UNREAD_DOT_COLOR = '#fa541c'

/** The small red-orange dot that says something is new (PRD 5.18); decorative, so screen readers skip it. */
export function UnreadDot({ ringColor, style }: Props) {
  return (
    <span
      aria-hidden
      data-testid="unread-dot"
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: UNREAD_DOT_COLOR,
        boxShadow: ringColor ? `0 0 0 2px ${ringColor}` : undefined,
        ...style,
      }}
    />
  )
}
