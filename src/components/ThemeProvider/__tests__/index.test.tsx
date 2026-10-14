// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { theme } from 'antd'
import { afterEach, describe, expect, it } from 'vitest'
import { CONTROL_HEIGHT } from '../../../theme/controlHeight.ts'
import { ThemeProvider } from '../index.tsx'

afterEach(cleanup)

/** Shows the tokens the theme gives to whatever is rendered inside it. */
function ShowTokens() {
  const { token } = theme.useToken()
  return (
    <output>
      {[token.controlHeightSM, token.controlHeight, token.controlHeightLG].join(' ')}
    </output>
  )
}

describe('ThemeProvider', () => {
  it('makes every control 40 px high, whatever its size', () => {
    render(
      <ThemeProvider>
        <ShowTokens />
      </ThemeProvider>,
    )

    // Small, middle and large: buttons, inputs, dropdowns and date pickers all follow them.
    expect(CONTROL_HEIGHT).toBe(40)
    expect(screen.getByRole('status')).toHaveTextContent('40 40 40')
  })
})
