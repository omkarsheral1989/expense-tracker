/**
 * GitHub Pages has no single-page-app fallback: an address such as
 * `/ownledger/groups/123` has no file behind it, so Pages shows its 404 page.
 * `deploy/404.html` (copied to the site's root) turns that address into
 * `/ownledger/?/groups/123`, with "&" written as "~and~" so a query string can
 * follow. This puts the original address back before the router starts.
 */
export function restoreRedirectedUrl(
  location: Pick<Location, 'pathname' | 'search' | 'hash'>,
  history: Pick<History, 'replaceState'>,
) {
  if (!location.search.startsWith('?/') || !location.pathname.endsWith('/')) return
  const route = location.search
    .slice(1)
    .split('&')
    .map((part) => part.replace(/~and~/g, '&'))
    .join('?')
  history.replaceState(null, '', location.pathname.slice(0, -1) + route + location.hash)
}
