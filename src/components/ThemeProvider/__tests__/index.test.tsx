// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { theme } from 'antd'
import { afterEach, describe, expect, it } from 'vitest'
import { CARD_PADDING } from '../../../theme/cardPadding.ts'
import { CONTROL_HEIGHT } from '../../../theme/controlHeight.ts'
import { RADIUS } from '../../../theme/radius.ts'
import { ThemeProvider } from '../index.tsx'
import { themeFor } from '../utils.ts'

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

  it('gives every card a 20 px corner radius and 10 px of padding, in light and dark', () => {
    for (const scheme of ['light', 'dark'] as const) {
      expect(themeFor(scheme).components?.Card).toEqual({ borderRadiusLG: 20, bodyPadding: 10 })
    }
    expect(RADIUS.card).toBe(20)
    expect(CARD_PADDING).toBe(10)
  })

  it('has two card radii: the usual 20 px and the larger 30 px a roomy card takes (the balance rows)', () => {
    expect(RADIUS.card).toBe(20)
    expect(RADIUS.cardLarge).toBe(30)
  })

  it('keeps the small corner radius at 10 px and the container one at 24 px, and the controls on the small one', () => {
    const config = themeFor('light')

    expect(RADIUS.inner).toBe(10)
    expect(RADIUS.outer).toBe(24)
    expect(config.token).toMatchObject({ borderRadius: 10, borderRadiusSM: 10, borderRadiusXS: 10, borderRadiusLG: 24 })
    for (const control of ['Button', 'Input', 'InputNumber', 'Select', 'DatePicker'] as const) {
      expect(config.components?.[control], control).toMatchObject({ borderRadiusLG: 10 })
    }
  })

  it('veils what is behind a sheet or dialog with light white in dark mode, and leaves Ant Design\'s black dim in light mode', () => {
    expect(themeFor('dark').token?.colorBgMask).toBe('rgba(255, 255, 255, 0.3)')
    expect(themeFor('light').token?.colorBgMask).toBeUndefined()
  })

  it('follows the color scheme with its algorithm', () => {
    expect(themeFor('dark').algorithm).toBe(theme.darkAlgorithm)
    expect(themeFor('light').algorithm).toBe(theme.defaultAlgorithm)
  })
})
