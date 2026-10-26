// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AmountInput } from '../index.tsx'

afterEach(cleanup)

describe('AmountInput alignment', () => {
  it('puts the number at the end of a small field by default', () => {
    render(<AmountInput currency="GBP" large={false} value="12.5" />)

    expect(screen.getByRole('textbox', { name: 'Amount' })).toHaveStyle({ textAlign: 'end' })
  })

  it('puts it at the start when asked', () => {
    render(<AmountInput currency="GBP" large={false} align="start" value="12.5" />)

    expect(screen.getByRole('textbox', { name: 'Amount' })).toHaveStyle({ textAlign: 'start' })
  })

  it('always starts a large field at the start, whatever is asked', () => {
    render(<AmountInput currency="GBP" align="end" value="12.5" />)

    expect(screen.getByRole('textbox', { name: 'Amount' }).style.textAlign).toBe('')
  })

  it('shows a prefix before the number', () => {
    render(<AmountInput currency="GBP" large={false} align="start" prefix="£" value="12.5" />)

    expect(screen.getByRole('textbox', { name: 'Amount' }).closest('.ant-input-affix-wrapper')).toHaveTextContent('£')
  })
})
