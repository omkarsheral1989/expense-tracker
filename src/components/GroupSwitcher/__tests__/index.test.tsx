// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GroupSwitcher } from '../index.tsx'

const trip = { id: 'g1', name: 'Goa trip', type: 'trip' as const }
const flat = { id: 'g2', name: 'Flat bills', type: 'home' as const }

describe('GroupSwitcher', () => {
  afterEach(cleanup)

  it('is a plain label when the user has only this group', () => {
    render(<GroupSwitcher group={trip} groups={[trip]} onSwitch={() => {}} />)

    expect(screen.getByText('Goa trip')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('is a full-width dropdown that lists the groups and calls onSwitch with the one chosen', async () => {
    const onSwitch = vi.fn()
    render(<GroupSwitcher group={trip} groups={[trip, flat]} onSwitch={onSwitch} />)

    const button = screen.getByRole('button', { name: 'Group: Goa trip. Choose another group' })
    expect(button).toBeEnabled()
    expect(button).toHaveClass('ant-btn-block')
    await userEvent.click(button)
    await userEvent.click(await screen.findByText('Flat bills'))

    expect(onSwitch).toHaveBeenCalledWith('g2')
  })

  it('shows the same button switched off, with no menu, when disabled', async () => {
    render(<GroupSwitcher group={trip} disabled />)

    const button = screen.getByRole('button', { name: 'Group: Goa trip' })
    expect(button).toBeDisabled()
    expect(button).toHaveClass('ant-btn-block')
    expect(button.querySelector('.tabler-icon-plane')).not.toBeNull()
    expect(button.querySelector('.tabler-icon-chevron-down')).not.toBeNull()
    await userEvent.click(button)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
