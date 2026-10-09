import { describe, expect, it, vi } from 'vitest'
import notFoundPage from '../../../deploy/404.html?raw'
import { restoreRedirectedUrl } from '../redirect.ts'

type Where = { pathname: string; search: string; hash: string }

/** Runs the script of deploy/404.html as Pages would and returns where it sends the visitor. */
function runNotFoundPage(where: Where) {
  const script = /<script>([\s\S]*?)<\/script>/.exec(notFoundPage)![1]
  const replace = vi.fn()
  new Function('window', script)({ location: { ...where, replace } })
  return replace
}

function restore(where: Where) {
  const replaceState = vi.fn()
  restoreRedirectedUrl(where, { replaceState })
  return replaceState
}

/** Splits an address such as /a/b?x=1#h into the parts of a location. */
function locate(address: string): Where {
  const url = new URL(address, 'https://omkarsheral1989.github.io')
  return { pathname: url.pathname, search: url.search, hash: url.hash }
}

describe('deploy/404.html', () => {
  it('sends an inner address of the app to the start page, with the route after "?/"', () => {
    const replace = runNotFoundPage(locate('/ownledger/groups/123'))
    expect(replace).toHaveBeenCalledWith('/ownledger/?/groups/123')
  })

  it('keeps the query string and the hash, and escapes "&" so they survive', () => {
    const replace = runNotFoundPage(locate('/ownledger/groups/1?a=1&b=2#top'))
    expect(replace).toHaveBeenCalledWith('/ownledger/?/groups/1&a=1~and~b=2#top')
  })

  it('leaves addresses outside the app alone', () => {
    expect(runNotFoundPage(locate('/nonogram/missing.html'))).not.toHaveBeenCalled()
    expect(runNotFoundPage(locate('/ownledger-other/x'))).not.toHaveBeenCalled()
  })
})

describe('restoreRedirectedUrl', () => {
  it('puts the original route back', () => {
    const replaceState = restore(locate('/ownledger/?/groups/123'))
    expect(replaceState).toHaveBeenCalledWith(null, '', '/ownledger/groups/123')
  })

  it('puts back the query string and the hash', () => {
    const replaceState = restore(locate('/ownledger/?/groups/1&a=1~and~b=2#top'))
    expect(replaceState).toHaveBeenCalledWith(null, '', '/ownledger/groups/1?a=1&b=2#top')
  })

  it('does nothing on a normal address', () => {
    expect(restore(locate('/ownledger/'))).not.toHaveBeenCalled()
    expect(restore(locate('/ownledger/?platform=ios'))).not.toHaveBeenCalled()
    expect(restore(locate('/ownledger/home'))).not.toHaveBeenCalled()
  })

  it('restores every address that 404.html redirects', () => {
    for (const address of [
      '/ownledger/home',
      '/ownledger/groups/new',
      '/ownledger/groups/4e211f6a/expenses/ae442ea0',
      '/ownledger/groups/1?a=1&b=2&c=3#top',
    ]) {
      const redirected = runNotFoundPage(locate(address)).mock.calls[0][0]
      const replaceState = restore(locate(redirected))
      expect(replaceState).toHaveBeenCalledWith(null, '', address)
    }
  })
})
