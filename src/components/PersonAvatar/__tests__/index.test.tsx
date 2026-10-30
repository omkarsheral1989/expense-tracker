// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { theme } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderPage } from '../../../testing/render.tsx'
import { PRIMARY } from '../../ThemeProvider/utils.ts'
import { PersonAvatar } from '../index.tsx'

const ADDRESS = 'https://lh3.googleusercontent.com/a/priya'

function renderAvatar(picture?: string | null, count = 1) {
  return renderPage(
    <>
      {Array.from({ length: count }, (_, index) => (
        <PersonAvatar key={index} name="priya shah" picture={picture} />
      ))}
    </>,
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('PersonAvatar', () => {
  it('shows the first letter of the name, capitalized, when there is no picture', () => {
    renderAvatar(undefined)

    expect(screen.getByText('P')).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
  })

  it('puts the letter on the stronger shade of the primary background, so it stands out on a row washed with the plain one', () => {
    renderAvatar(undefined)

    const { colorPrimaryBg, colorPrimaryBgHover, colorPrimary } = theme.getDesignToken({ token: { colorPrimary: PRIMARY } })
    const avatar = document.querySelector('.ant-avatar') as HTMLElement
    expect(avatar).toHaveStyle({ background: colorPrimaryBgHover, color: colorPrimary })
    expect(avatar).not.toHaveStyle({ background: colorPrimaryBg })
  })

  it('shows the letter when the picture is null', () => {
    renderAvatar(null)

    expect(screen.getByText('P')).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
  })

  it('shows the picture at its address, without a referrer, as Google requires', () => {
    renderAvatar(ADDRESS)

    const image = document.querySelector('img')!
    expect(image).toHaveAttribute('src', ADDRESS)
    expect(image).toHaveAttribute('referrerpolicy', 'no-referrer')
  })

  it('shows every avatar at the address, and downloads nothing itself (Google blocks it, ADR-046)', async () => {
    const fetching = vi.fn()
    vi.stubGlobal('fetch', fetching)

    renderAvatar(ADDRESS, 3)

    expect([...document.querySelectorAll('img')].map((image) => image.getAttribute('src'))).toEqual([ADDRESS, ADDRESS, ADDRESS])
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(fetching).not.toHaveBeenCalled()
  })

  it('falls back to the letter when the picture cannot be loaded', async () => {
    renderAvatar(ADDRESS)

    fireEvent.error(document.querySelector('img')!)

    await waitFor(() => expect(document.querySelector('img')).toBeNull())
    expect(screen.getByText('P')).toBeInTheDocument()
  })
})
