// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BackButton } from '../index.tsx'

describe('BackButton', () => {
  afterEach(cleanup)

  it('is a button named Back with an arrow, and calls what it is given when pressed', async () => {
    const onClick = vi.fn()
    render(<BackButton onClick={onClick} />)

    const button = screen.getByRole('button', { name: 'Back' })
    expect(button.querySelector('[data-icon="arrow-left"]')).not.toBeNull()
    expect(onClick).not.toHaveBeenCalled()
    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('looks like the Edit and Delete buttons: an outlined square, not a bare icon', () => {
    render(<BackButton onClick={() => undefined} />)

    const button = screen.getByRole('button', { name: 'Back' })
    expect(button).toHaveClass('ant-btn-default', 'ant-btn-variant-outlined', 'ant-btn-icon-only')
    expect(button).not.toHaveClass('ant-btn-text')
  })
})
