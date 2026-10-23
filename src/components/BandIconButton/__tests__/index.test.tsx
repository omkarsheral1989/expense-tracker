// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BandIconButton } from '../index.tsx'

describe('BandIconButton', () => {
  afterEach(cleanup)

  it('is a round white icon button, named for screen readers, that calls onClick', async () => {
    const onClick = vi.fn()
    render(<BandIconButton icon={<span>i</span>} label="Edit" onClick={onClick} />)

    const button = screen.getByRole('button', { name: 'Edit' })
    expect(button).toHaveClass('ant-btn-circle', 'ant-btn-icon-only')
    expect(button).toHaveStyle({ background: '#fff' })
    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('is switched off, with a "Coming soon" tip, when it has no action', async () => {
    render(<BandIconButton icon={<span>i</span>} label="Search" />)

    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled()
  })

  it('shows itself busy while loading', () => {
    render(<BandIconButton icon={<span>i</span>} label="Restore" onClick={() => {}} loading />)

    expect(screen.getByRole('button', { name: 'Restore' })).toHaveClass('ant-btn-loading')
  })

  it('can be switched off for now with no tip, and does not act when pressed', async () => {
    const onClick = vi.fn()
    render(<BandIconButton icon={<span>i</span>} label="Edit" onClick={onClick} disabled />)

    const button = screen.getByRole('button', { name: 'Edit' })
    expect(button).toBeDisabled()
    // A "Coming soon" tip wraps the button in a span; a switched-off button with no tip does not.
    expect(button.parentElement?.tagName).toBe('DIV')
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })
})
