import { useLocation } from 'react-router'

/** Shows where the app currently is, so a test can check a navigation. */
export function CurrentPath() {
  return <div data-testid="current-path">{useLocation().pathname}</div>
}
