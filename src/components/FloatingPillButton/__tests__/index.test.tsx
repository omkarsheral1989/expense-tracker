// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '../../ThemeProvider'
import {
  ABOVE_FLOATING_BUTTON,
  FLOATING_BUTTON_BOTTOM,
  FLOATING_BUTTON_GAP,
  FLOATING_BUTTON_HEIGHT,
  FLOATING_BUTTON_ROOM,
} from '../constants.ts'
import { FloatingPillButton } from '../index.tsx'

afterEach(cleanup)

function renderButton(onClick = vi.fn()) {
  render(
    <ThemeProvider>
      <FloatingPillButton onClick={onClick}>Add thing</FloatingPillButton>
    </ThemeProvider>,
  )
  return screen.getByRole('button', { name: /add thing/i })
}

describe('FloatingPillButton', () => {
  it('floats at the bottom right of the screen and is a 48 px high pill, taller than other buttons', () => {
    const button = renderButton()

    expect(button.parentElement).toHaveStyle({ position: 'fixed' })
    // Its distance from the bottom, plus the space the device keeps free there (jsdom keeps env() as written).
    expect(button.parentElement?.getAttribute('style')).toContain(`bottom: calc(${FLOATING_BUTTON_BOTTOM}px + env(safe-area-inset-bottom))`)
    expect(button).toHaveStyle({ height: `${FLOATING_BUTTON_HEIGHT}px` })
    expect(FLOATING_BUTTON_HEIGHT).toBe(48)
    // The frame rounds it and clips the square button inside, which travels square into the page it opens (PRD 5.16).
    expect(button.parentElement).toHaveStyle({ borderRadius: '999px', overflow: 'hidden' })
    expect(button).toHaveStyle({ borderRadius: '0px' })
  })

  it('calls onClick when it is pressed', async () => {
    const onClick = vi.fn()
    await userEvent.click(renderButton(onClick))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('says where an empty message must end: 16 px above the top of the button', () => {
    // The button's top is at 24 + 48 = 72 px from the bottom; 16 px above that is 88 px.
    expect(FLOATING_BUTTON_GAP).toBe(16)
    expect(ABOVE_FLOATING_BUTTON).toBe(FLOATING_BUTTON_BOTTOM + FLOATING_BUTTON_HEIGHT + FLOATING_BUTTON_GAP)
    expect(ABOVE_FLOATING_BUTTON).toBe(88)
  })

  it('leaves more room below a list than an empty message does, so the last row clears the button', () => {
    expect(FLOATING_BUTTON_ROOM).toBeGreaterThan(ABOVE_FLOATING_BUTTON)
  })
})
