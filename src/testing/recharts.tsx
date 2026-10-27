import { cloneElement, type ComponentType, type ReactElement } from 'react'

/** The size every chart has in tests, in px. */
export const CHART_SIZE = { width: 400, height: 220 }

/**
 * For a test file's `vi.mock('recharts', ...)`. Recharts' `ResponsiveContainer` measures its parent, and jsdom has no layout, so a chart
 * inside it would draw nothing: this gives its chart a fixed size instead. And a pie draws its slices in over an animation, which
 * jsdom runs unevenly under load: this turns it off, so the slices, labels and tooltip are in the DOM at once (ADR-064). Use it as
 * `vi.mock('recharts', async (importOriginal) => (await import('../../testing/recharts.tsx')).withFixedSize(await importOriginal()))`.
 */
export function withFixedSize<T extends { Pie: ComponentType<{ isAnimationActive?: boolean }> }>(recharts: T): T {
  const Pie = recharts.Pie
  return {
    ...recharts,
    ResponsiveContainer: ({ children }: { children: ReactElement<object> }) => cloneElement(children, CHART_SIZE),
    Pie: (props: { isAnimationActive?: boolean }) => <Pie {...props} isAnimationActive={false} />,
  }
}
