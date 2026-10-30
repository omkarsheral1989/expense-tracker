import { useLayoutEffect, useRef } from 'react'

/** How long a line takes to slide into its new place. */
const SLIDE_MS = 300

/**
 * Makes the items of a list slide to their new places when their order changes (a FLIP animation: each moved item starts
 * where it was and glides to where it is). Pass the keys in their current order and put the returned function on each item
 * as its `ref`, given its key: `ref={register(key)}`. An item that is new, or whose key is newly in `fadeIn`, fades in where it
 * is instead of sliding, while the others move out of its way. People who asked for less motion get no animation.
 */
export function useSlideReorder(keys: readonly string[], fadeIn: readonly string[] = []) {
  const elements = useRef(new Map<string, HTMLElement>())
  const tops = useRef(new Map<string, number>())
  const lastOrder = useRef('')
  const lastFadeIn = useRef<string[]>([])
  const order = keys.join('|')

  // After every render, so the tops it remembers are always where the items were on the screen just before.
  useLayoutEffect(() => {
    const reordered = lastOrder.current !== '' && lastOrder.current !== order
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const next = new Map<string, number>()
    elements.current.forEach((element, key) => {
      const top = element.getBoundingClientRect().top
      next.set(key, top)
      if (!reordered || reduced || !element.animate) return
      const before = tops.current.get(key)
      if (before === undefined || (fadeIn.includes(key) && !lastFadeIn.current.includes(key))) {
        element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: SLIDE_MS, easing: 'ease' })
      } else if (before !== top) {
        element.animate([{ transform: `translateY(${before - top}px)` }, { transform: 'none' }], { duration: SLIDE_MS, easing: 'ease' })
      }
    })
    tops.current = next
    lastOrder.current = order
    lastFadeIn.current = [...fadeIn]
  })

  return (key: string) => (element: HTMLElement | null) => {
    if (element) elements.current.set(key, element)
    else elements.current.delete(key)
  }
}
