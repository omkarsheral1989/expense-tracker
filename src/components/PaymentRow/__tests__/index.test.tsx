// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderPage } from '../../../testing/render.tsx'
import { CATEGORY_GROUP_COLORS } from '../../../theme/categoryColors.ts'
import { PaymentRow } from '../index.tsx'

afterEach(cleanup)

const row = () => screen.getByRole('group', { name: 'You paid Priya' })

describe('PaymentRow', () => {
  it('is a group named by the sentence, with the payer, an arrow and the recipient in that order', () => {
    renderPage(<PaymentRow payer={{ name: 'You' }} recipient={{ name: 'Priya' }} label="You paid Priya" />)

    // Each side is its avatar's initial and then its name; "paid" sits between them.
    expect(row().textContent).toBe('YYoupaidPPriya')
  })

  it('draws both people as avatars: a picture where there is one and the initial where not', () => {
    renderPage(<PaymentRow payer={{ name: 'You', picture: 'https://example.com/me.png' }} recipient={{ name: 'Priya' }} label="You paid Priya" />)

    const avatars = row().querySelectorAll('.ant-avatar')
    expect(avatars).toHaveLength(2)
    expect(avatars[0].querySelector('img')).toHaveAttribute('src', 'https://example.com/me.png')
    expect(avatars[1].querySelector('img')).toBeNull()
    expect(within(avatars[1] as HTMLElement).getByText('P')).toBeInTheDocument()
  })

  it('draws a long arrow with "paid" in it in the payment\'s green, hidden from screen readers', () => {
    renderPage(<PaymentRow payer={{ name: 'You' }} recipient={{ name: 'Priya' }} label="You paid Priya" />)

    const arrow = screen.getByText('paid').parentElement as HTMLElement
    expect(arrow).toHaveAttribute('aria-hidden', 'true')
    const lines = [...arrow.querySelectorAll('div')].filter((one) => one.style.height === '2px')
    expect(lines).toHaveLength(2)
    for (const line of lines) expect(line).toHaveStyle({ background: CATEGORY_GROUP_COLORS.settlement })
  })

  it('has no spacing of its own, and takes the style the page gives it', () => {
    const first = renderPage(<PaymentRow payer={{ name: 'You' }} recipient={{ name: 'Priya' }} label="You paid Priya" />)
    expect(row().style.margin).toBe('')
    expect(row().style.marginBottom).toBe('')
    first.unmount()

    renderPage(<PaymentRow payer={{ name: 'You' }} recipient={{ name: 'Priya' }} label="You paid Priya" style={{ marginBottom: 20 }} />)
    expect(row()).toHaveStyle({ marginBottom: '20px' })
  })

  it('wraps a long name instead of running off the screen', () => {
    renderPage(<PaymentRow payer={{ name: 'A very long name indeed' }} recipient={{ name: 'Priya' }} label="x paid Priya" />)

    expect(screen.getByText('A very long name indeed')).toHaveStyle({ overflowWrap: 'anywhere' })
  })
})
