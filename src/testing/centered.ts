import { expect } from 'vitest'

/**
 * Checks that a message sits in the box `CenteredMessage` makes: centered
 * vertically and horizontally, and filling the rest of the page's column.
 * `roomBelow` is the space it keeps free at the bottom, when there is one.
 * (Ant Design centers through these classes; with its runtime styles off in
 * tests, computed styles cannot show it. See ADR-029.)
 */
export function expectCenteredMessage(message: HTMLElement, roomBelow = 0) {
  const box = message.closest('.ant-flex-align-center.ant-flex-justify-center')
  expect(box).not.toBeNull()
  expect(box).toHaveStyle({ flex: '1', paddingBottom: `${roomBelow}px` })
}
