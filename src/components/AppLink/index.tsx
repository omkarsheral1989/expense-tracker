import type { MouseEvent } from 'react'
import { Link, type LinkProps } from 'react-router'
import { useAppNavigate } from '../../hooks/useAppNavigate'
import type { NavDirection } from '../../hooks/useAppNavigate/utils.ts'

type Props = Omit<LinkProps, 'replace' | 'viewTransition'> & {
  /** Which way the page slides: forward (the default) or back, for a link that returns to where the user came from. */
  direction?: NavDirection
}

/**
 * A router `Link` whose page change slides like `useAppNavigate`'s (PRD 5.15).
 * A click with a modifier key, or a middle click, is left to the browser.
 */
export function AppLink({ direction, onClick, to, state, ...rest }: Props) {
  const navigate = useAppNavigate()

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event)
    const plain = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
    if (event.defaultPrevented || !plain || rest.target === '_blank') return
    event.preventDefault()
    navigate(to, { direction, state })
  }

  return <Link {...rest} to={to} state={state} onClick={handleClick} />
}
