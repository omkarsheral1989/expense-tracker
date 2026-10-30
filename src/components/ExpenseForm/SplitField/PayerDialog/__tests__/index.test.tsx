// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GroupMember } from '../../../../../services/groupService/types.ts'
import { renderPage } from '../../../../../testing/render.tsx'
import { PayerDialog } from '../index.tsx'

const members: GroupMember[] = [
  { personId: 'omkar', email: 'omkar@gmail.com', name: 'Omkar', isYou: true, picture: null },
  { personId: 'priya', email: 'priya@gmail.com', name: 'Priya Shah', isYou: false, picture: 'https://lh3.googleusercontent.com/a/priya' },
  { personId: 'sam', email: null, name: 'Sam', isYou: false, picture: null },
]

function renderDialog(value = 'omkar', onPick = vi.fn()) {
  renderPage(<PayerDialog open onClose={() => {}} members={members} value={value} onPick={onPick} />)
  return onPick
}

const rowOf = (name: RegExp) => screen.getByRole('button', { name })

describe('PayerDialog', () => {
  afterEach(cleanup)

  it('shows each member with their picture (or initial), their name and their email', async () => {
    renderDialog()
    const dialog = await screen.findByRole('dialog', { name: 'Who paid?' })

    const you = within(dialog).getByRole('button', { name: /You/ })
    expect(you).toHaveTextContent('Y')
    expect(you).toHaveTextContent('omkar@gmail.com')
    const priya = rowOf(/Priya Shah/)
    expect(priya.querySelector('img')).toHaveAttribute('src', 'https://lh3.googleusercontent.com/a/priya')
    expect(priya).toHaveTextContent('priya@gmail.com')
    expect(rowOf(/Sam/)).toHaveTextContent('No email')
    expect(rowOf(/Sam/)).toHaveTextContent('S')
  })

  it('names the user "You" and others by the name shown for them', async () => {
    renderDialog()
    await screen.findByRole('dialog', { name: 'Who paid?' })

    expect(within(rowOf(/You/)).getByText('You')).toBeInTheDocument()
    expect(within(rowOf(/Priya Shah/)).getByText('Priya Shah')).toBeInTheDocument()
  })

  it('ticks and highlights only the chosen payer', async () => {
    renderDialog('priya')
    await screen.findByRole('dialog', { name: 'Who paid?' })

    const chosen = rowOf(/Priya Shah/)
    expect(chosen).toHaveAttribute('aria-pressed', 'true')
    expect(chosen.querySelector('.tabler-icon-check')).not.toBeNull()
    expect(chosen).toHaveStyle({ background: 'var(--ant-color-primary-bg)' })
    for (const other of [rowOf(/You/), rowOf(/Sam/)]) {
      expect(other).toHaveAttribute('aria-pressed', 'false')
      expect(other.querySelector('.tabler-icon-check')).toBeNull()
      expect(other).not.toHaveStyle({ background: 'var(--ant-color-primary-bg)' })
    }
  })

  it('calls onPick with the person who was pressed', async () => {
    const onPick = renderDialog()
    await screen.findByRole('dialog', { name: 'Who paid?' })

    await userEvent.click(rowOf(/Priya Shah/))

    expect(onPick).toHaveBeenCalledWith('priya')
  })

  it('keeps "Multiple people" switched off', async () => {
    renderDialog()
    await screen.findByRole('dialog', { name: 'Who paid?' })

    expect(screen.getByRole('button', { name: 'Multiple people' })).toBeDisabled()
  })
})
