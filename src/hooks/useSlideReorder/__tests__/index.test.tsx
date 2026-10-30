// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSlideReorder } from '../index.ts'

const animate = vi.fn()

/** jsdom has no layout: an item is as far down as its place in the list (50 px each). */
function List({ keys, fadeIn = [] }: { keys: string[]; fadeIn?: string[] }) {
  const register = useSlideReorder(keys, fadeIn)
  return (
    <div>
      {keys.map((key, index) => (
        <div key={key} ref={register(key)} data-key={key} data-top={index * 50}>
          {key}
        </div>
      ))}
    </div>
  )
}

function stubLayout(reducedMotion = false) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const top = Number(this.dataset.top ?? 0)
    return { top, bottom: top + 50, left: 0, right: 0, width: 0, height: 50, x: 0, y: top, toJSON: () => ({}) }
  })
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reducedMotion && query.includes('reduce'), addEventListener() {}, removeEventListener() {} }))
}

const calls = () => animate.mock.calls.map(([keyframes]) => keyframes)
const animatedKeys = () => animate.mock.contexts.map((element) => (element as HTMLElement).dataset.key)

beforeEach(() => {
  animate.mockClear()
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, writable: true, value: animate })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useSlideReorder', () => {
  it('animates nothing on the first render', () => {
    stubLayout()
    render(<List keys={['a', 'b', 'c']} />)

    expect(animate).not.toHaveBeenCalled()
  })

  it('slides the items that moved from where they were to where they are, and leaves the others', () => {
    stubLayout()
    const { rerender } = render(<List keys={['a', 'b', 'c']} />)

    rerender(<List keys={['a', 'c', 'b']} />)

    expect(animatedKeys().sort()).toEqual(['b', 'c'])
    const byKey = Object.fromEntries(animate.mock.contexts.map((element, index) => [(element as HTMLElement).dataset.key, calls()[index]]))
    // b was at 50 and is at 100: it starts 50 px above its place; c was at 100 and is at 50: 50 px below.
    expect(byKey.b).toEqual([{ transform: 'translateY(-50px)' }, { transform: 'none' }])
    expect(byKey.c).toEqual([{ transform: 'translateY(50px)' }, { transform: 'none' }])
  })

  it('fades in an item that is new instead of sliding it', () => {
    stubLayout()
    const { rerender } = render(<List keys={['a', 'b']} />)

    rerender(<List keys={['a', 'b', 'c']} />)

    expect(animatedKeys()).toEqual(['c'])
    expect(calls()[0]).toEqual([{ opacity: 0 }, { opacity: 1 }])
  })

  it('fades in an item whose key is newly in fadeIn while the others slide out of its way', () => {
    stubLayout()
    const { rerender } = render(<List keys={['a', 'b', 'c']} fadeIn={[]} />)

    rerender(<List keys={['a', 'c', 'b']} fadeIn={['c']} />)

    const byKey = Object.fromEntries(animate.mock.contexts.map((element, index) => [(element as HTMLElement).dataset.key, calls()[index]]))
    expect(byKey.c).toEqual([{ opacity: 0 }, { opacity: 1 }])
    expect(byKey.b).toEqual([{ transform: 'translateY(-50px)' }, { transform: 'none' }])
  })

  it('fades an item in only the first time its key is in fadeIn', () => {
    stubLayout()
    const { rerender } = render(<List keys={['a', 'b', 'c']} fadeIn={[]} />)
    rerender(<List keys={['a', 'c', 'b']} fadeIn={['c']} />)
    animate.mockClear()

    rerender(<List keys={['c', 'a', 'b']} fadeIn={['c']} />)

    const opacity = calls().filter((keyframes) => 'opacity' in keyframes[0])
    expect(opacity).toEqual([])
    expect(animatedKeys().sort()).toEqual(['a', 'c'])
  })

  it('animates nothing for people who asked for less motion', () => {
    stubLayout(true)
    const { rerender } = render(<List keys={['a', 'b', 'c']} />)

    rerender(<List keys={['c', 'a', 'b']} />)

    expect(animate).not.toHaveBeenCalled()
  })

  it('animates nothing when the order did not change', () => {
    stubLayout()
    const { rerender } = render(<List keys={['a', 'b']} />)

    rerender(<List keys={['a', 'b']} />)

    expect(animate).not.toHaveBeenCalled()
  })
})
