// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemberDonut, type DonutSlice } from '../index.tsx'

// A chart inside `ResponsiveContainer` draws nothing without layout; give it a fixed size.
vi.mock('recharts', async (importOriginal) => (await import('../../../testing/recharts.tsx')).withFixedSize(await importOriginal()))

afterEach(cleanup)

const slices: DonutSlice[] = [
  { id: 'a', label: 'You', value: 300, color: '#0d9488' },
  { id: 'b', label: 'Priya', value: 200, color: '#f97316' },
  { id: 'c', label: 'Sam', value: 0, color: '#6366f1' },
]
const format = (value: number) => `$${(value / 100).toFixed(2)}`

function renderDonut(overrides: Partial<React.ComponentProps<typeof MemberDonut>> = {}) {
  return render(<MemberDonut slices={slices} label="Shares" total="$5.00" format={format} {...overrides} />)
}

const sectors = (container: HTMLElement) => [...container.querySelectorAll<SVGPathElement>('.recharts-sector')]

describe('MemberDonut', () => {
  it('writes the label and the total in its hole', () => {
    renderDonut()

    expect(screen.getByText('Shares')).toBeInTheDocument()
    expect(screen.getByText('$5.00')).toBeInTheDocument()
  })

  it('lets touches through the hole to the slices', () => {
    renderDonut()

    expect(screen.getByText('$5.00').closest('[style*="pointer-events"]')).toHaveStyle({ pointerEvents: 'none', position: 'absolute' })
  })

  it('draws a slice for each member with an amount, in the color given, and none for an amount of 0', async () => {
    const { container } = renderDonut()

    await waitFor(() => expect(sectors(container)).toHaveLength(2))
    expect(sectors(container).map((sector) => sector.getAttribute('fill'))).toEqual(['#0d9488', '#f97316'])
  })

  it('is a donut: its slices have an inner radius, so there is a hole', async () => {
    const { container } = renderDonut()

    await waitFor(() => expect(sectors(container)).toHaveLength(2))
    // A ring sector's path has two arcs (outer and inner); a full pie slice has one.
    expect(sectors(container)[0].getAttribute('d')?.match(/A /g)).toHaveLength(2)
  })

  it('shows a slice\'s name and amount when it is pointed at, and nothing otherwise', async () => {
    const { container } = renderDonut()
    await waitFor(() => expect(sectors(container)).toHaveLength(2))
    expect(screen.queryByText('Priya')).not.toBeInTheDocument()

    fireEvent.mouseOver(sectors(container)[1])

    expect(await screen.findByText('Priya')).toBeInTheDocument()
    expect(screen.getByText('$2.00')).toBeInTheDocument()
  })

  it('draws one full ring for a single member, without a gap', async () => {
    const { container } = renderDonut({ slices: [{ id: 'a', label: 'You', value: 500, color: '#0d9488' }] })

    await waitFor(() => expect(sectors(container)).toHaveLength(1))
  })

  it('draws a member with an amount of 0 as no slice at all, so the one slice that is left has no gap in it', async () => {
    const alone = renderDonut({ slices: [{ id: 'a', label: 'You', value: 500, color: '#0d9488' }] })
    await waitFor(() => expect(sectors(alone.container)).toHaveLength(1))
    const fullRing = sectors(alone.container)[0].getAttribute('d')
    alone.unmount()

    const withZero = renderDonut({
      slices: [
        { id: 'a', label: 'You', value: 500, color: '#0d9488' },
        { id: 'b', label: 'Priya', value: 0, color: '#f97316' },
      ],
    })

    await waitFor(() => expect(sectors(withZero.container)).toHaveLength(1))
    expect(sectors(withZero.container)[0].getAttribute('d')).toBe(fullRing)
  })

  it('draws no slice when nothing has an amount', () => {
    const { container } = renderDonut({ slices: [{ id: 'a', label: 'You', value: 0, color: '#0d9488' }] })

    expect(sectors(container)).toHaveLength(0)
  })
})
