// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { currencyService } from '../../../services/currencyService'
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

  describe('its look', () => {
    const detailed = { ...trip, defaultCurrency: 'GBP', memberCount: 3 }
    const detailedFlat = { ...flat, defaultCurrency: 'EUR', memberCount: 1 }
    const pound = currencyService.symbol('GBP', navigator.language) ?? 'GBP'
    const euro = currencyService.symbol('EUR', navigator.language) ?? 'EUR'

    it('shows the type\'s colored tile, the name and "currency · members" in the pill', () => {
      render(<GroupSwitcher group={detailed} groups={[detailed, detailedFlat]} onSwitch={() => {}} />)

      const button = screen.getByRole('button', { name: /^Group: Goa trip/ })
      const tile = button.querySelector('[role="img"][aria-label="Trip"]') as HTMLElement
      expect(tile).not.toBeNull()
      expect(tile).toHaveStyle({ width: '40px', height: '40px', background: 'rgb(8, 145, 178)' })
      expect(button).toHaveTextContent(`Goa trip${pound} · 3 members`)
    })

    it('is 20 px round with 10 px of padding, taller than a normal control', () => {
      render(<GroupSwitcher group={detailed} groups={[detailed, detailedFlat]} onSwitch={() => {}} />)

      expect(screen.getByRole('button', { name: /^Group: Goa trip/ })).toHaveStyle({ borderRadius: '20px', padding: '10px', height: 'auto' })
    })

    it('counts a group read in full by its members when it has no member count', () => {
      const full = { ...trip, defaultCurrency: 'GBP', members: [{}, {}] }
      render(<GroupSwitcher group={full} disabled />)

      expect(screen.getByRole('button', { name: 'Group: Goa trip' })).toHaveTextContent(`Goa trip${pound} · 2 members`)
    })

    it('says "1 member" for a group of one', () => {
      render(<GroupSwitcher group={detailedFlat} disabled />)

      expect(screen.getByRole('button', { name: 'Group: Flat bills' })).toHaveTextContent(new RegExp(`Flat bills${euro} · 1 member$`))
    })

    it('has each group\'s tile, name and details as a row of the menu, with a tick on the current one only', async () => {
      render(<GroupSwitcher group={detailed} groups={[detailed, detailedFlat]} onSwitch={() => {}} />)

      await userEvent.click(screen.getByRole('button', { name: /^Group: Goa trip/ }))
      const rows = await screen.findAllByRole('menuitem')

      expect(rows).toHaveLength(2)
      expect(rows[0].querySelector('[aria-label="Trip"]')).toHaveStyle({ width: '40px', height: '40px' })
      expect(rows[1].querySelector('[aria-label="Home"]')).toHaveStyle({ width: '40px', height: '40px' })
      expect(rows[0]).toHaveTextContent(`Goa trip${pound} · 3 members`)
      expect(rows[1]).toHaveTextContent(new RegExp(`Flat bills${euro} · 1 member$`))
      expect(rows[0].querySelector('.tabler-icon-check')).not.toBeNull()
      expect(rows[1].querySelector('.tabler-icon-check')).toBeNull()
      expect(rows[0]).toHaveStyle({ padding: '10px' })
    })

    it('rounds the menu with the card radius', async () => {
      render(<GroupSwitcher group={detailed} groups={[detailed, detailedFlat]} onSwitch={() => {}} />)

      await userEvent.click(screen.getByRole('button', { name: /^Group: Goa trip/ }))

      expect(await screen.findByRole('menu')).toHaveStyle({ borderRadius: '20px' })
    })

    it('takes the page\'s background when switched off, and keeps the white or grey one when working', () => {
      const { rerender } = render(<GroupSwitcher group={detailed} disabled />)
      expect(screen.getByRole('button', { name: 'Group: Goa trip' })).toHaveStyle({ background: 'var(--ant-color-bg-layout)' })

      rerender(<GroupSwitcher group={detailed} groups={[detailed, detailedFlat]} onSwitch={() => {}} />)
      expect(screen.getByRole('button', { name: /^Group: Goa trip/ })).not.toHaveStyle({ background: 'var(--ant-color-bg-layout)' })
    })
  })
})
