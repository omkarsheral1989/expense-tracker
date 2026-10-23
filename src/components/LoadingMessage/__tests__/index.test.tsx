// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LoadingMessage } from '../index.tsx'

afterEach(cleanup)

describe('LoadingMessage', () => {
  it('shows a spinner with the label and "…" under it, and announces it as a status', () => {
    render(<LoadingMessage label="Loading the group" />)

    const status = screen.getByRole('status', { name: 'Loading the group' })
    expect(status.querySelector('.ant-spin')).not.toBeNull()
    expect(status).toHaveTextContent('Loading the group…')
  })

  it('is centered in the space the page has, like the other message screens', () => {
    render(<LoadingMessage label="Loading" />)
    const box = screen.getByRole('status').parentElement as HTMLElement
    expect(box).toHaveStyle({ flex: '1', maxWidth: '720px' })
    expect(box).toHaveClass('ant-flex-align-center', 'ant-flex-justify-center')
  })

  it('keeps room below for a floating button when asked', () => {
    render(<LoadingMessage label="Loading" roomBelow={88} />)
    const box = screen.getByRole('status').parentElement as HTMLElement
    expect(box.getAttribute('style')).toContain('88px')
  })

  it('draws no skeleton', () => {
    render(<LoadingMessage label="Loading" />)
    expect(document.querySelector('.ant-skeleton')).toBeNull()
  })
})
