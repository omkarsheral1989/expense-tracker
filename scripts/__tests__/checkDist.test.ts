import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkDist, precachedUrls } from '../checkDist.ts'

let dist: string

const MANIFEST = {
  start_url: '/ownledger/',
  scope: '/ownledger/',
  share_target: {
    action: '/ownledger/share-target',
    method: 'POST',
    enctype: 'multipart/form-data',
    params: { title: 'title', text: 'text', url: 'url', files: [{ name: 'receipts', accept: ['image/*'] }] },
  },
}

function write(path: string, content: string) {
  mkdirSync(dirname(join(dist, path)), { recursive: true })
  writeFileSync(join(dist, path), content)
}

/** A worker source listing these files the way the build writes them. */
function worker(urls: string[], extra = "fetch('/ownledger/share-target')") {
  return `${extra};precacheAndRoute([${urls.map((url) => `{url:"${url}",revision:null}`).join(',')}])`
}

/** A build that is fine; each test breaks one thing. */
function writeGoodBuild(overrides: { worker?: string; manifest?: object | null } = {}) {
  write('index.html', '<html></html>')
  write('assets/index-abc.js', '1')
  write('assets/vite-browser-external-abc.js', '1')
  write('sw.js', overrides.worker ?? worker(['index.html', 'assets/index-abc.js', 'assets/vite-browser-external-abc.js']))
  if (overrides.manifest !== null) write('manifest.webmanifest', JSON.stringify(overrides.manifest ?? MANIFEST))
}

beforeEach(() => {
  dist = mkdtempSync(join(tmpdir(), 'dist-'))
})

afterEach(() => {
  rmSync(dist, { recursive: true, force: true })
})

describe('precachedUrls', () => {
  it('reads both ways the build writes an entry', () => {
    expect(precachedUrls('[{url:"a.js",revision:null},{"url":"b.css","revision":"1"}]')).toEqual(['a.js', 'b.css'])
  })
})

describe('checkDist', () => {
  it('accepts a good build', () => {
    writeGoodBuild()
    expect(checkDist(dist)).toEqual([])
  })

  it('reports a folder that does not exist', () => {
    expect(checkDist(join(dist, 'nope'))[0]).toMatch(/does not exist/)
  })

  it('refuses a file whose name starts with an underscore, which GitHub Pages hides', () => {
    writeGoodBuild()
    write('assets/__vite-browser-external-abc.js', '1')
    expect(checkDist(dist)).toEqual([expect.stringMatching(/__vite-browser-external-abc\.js.*hidden by GitHub Pages/)])
  })

  it('refuses a folder whose name starts with an underscore', () => {
    writeGoodBuild()
    write('_next/chunk.js', '1')
    expect(checkDist(dist)).toEqual([expect.stringMatching(/_next\/chunk\.js.*hidden/)])
  })

  it('allows an underscore inside a name', () => {
    writeGoodBuild()
    write('assets/some_file.js', '1')
    expect(checkDist(dist)).toEqual([])
  })

  it('refuses a precached file that is not in the build', () => {
    writeGoodBuild({ worker: worker(['index.html', 'assets/gone.js']) })
    expect(checkDist(dist)).toEqual([expect.stringMatching(/assets\/gone\.js.*not in the build/)])
  })

  it('refuses a file precached twice', () => {
    writeGoodBuild({ worker: worker(['index.html', 'index.html']) })
    expect(checkDist(dist)).toEqual([expect.stringMatching(/index\.html more than once/)])
  })

  it('refuses a worker that lists nothing', () => {
    writeGoodBuild({ worker: "fetch('/ownledger/share-target');precacheAndRoute([])" })
    expect(checkDist(dist)).toEqual([expect.stringMatching(/lists no precached files/)])
  })

  it('refuses a worker that does not answer the share address', () => {
    writeGoodBuild({ worker: worker(['index.html'], '') })
    expect(checkDist(dist)).toEqual([expect.stringMatching(/does not answer the share address/)])
  })

  it('refuses a build without a worker or a manifest', () => {
    write('index.html', '<html></html>')
    expect(checkDist(dist)).toEqual([
      expect.stringMatching(/sw\.js is missing/),
      expect.stringMatching(/manifest\.webmanifest is missing/),
    ])
  })

  it('refuses a build without index.html', () => {
    writeGoodBuild()
    rmSync(join(dist, 'index.html'))
    // index.html is also in the worker's list, so that is reported too.
    expect(checkDist(dist)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^index\.html is missing/)]),
    )
  })

  describe('the manifest share_target', () => {
    it('is required', () => {
      writeGoodBuild({ manifest: { ...MANIFEST, share_target: undefined } })
      expect(checkDist(dist)).toEqual([expect.stringMatching(/no share_target/)])
    })

    it.each([
      ['method', { method: 'GET' }, /must be POST/],
      ['encoding', { enctype: 'application/x-www-form-urlencoded' }, /multipart\/form-data/],
      ['action outside the scope', { action: '/elsewhere/share-target' }, /inside the manifest scope/],
      ['file field name', { params: { files: [{ name: 'photos', accept: ['image/*'] }] } }, /field named "receipts"/],
      ['accepted types', { params: { files: [{ name: 'receipts', accept: ['text/plain'] }] } }, /image\/\*/],
      ['missing files', { params: {} }, /field named "receipts"/],
    ])('must have the right %s', (_name, change, message) => {
      writeGoodBuild({ manifest: { ...MANIFEST, share_target: { ...MANIFEST.share_target, ...change } } })
      expect(checkDist(dist)).toEqual([expect.stringMatching(message)])
    })
  })
})
