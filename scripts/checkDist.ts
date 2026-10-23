// Checks a finished build (`dist`) for the problems that have broken the
// installed app before (ADR-022, ADR-047). Used by `deploy-pages.sh`, by
// `bun run check:build` and by the tests. Run as a script: `bun scripts/checkDist.ts dist`.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

type Manifest = {
  start_url?: string
  scope?: string
  share_target?: {
    action?: string
    method?: string
    enctype?: string
    params?: { files?: { name?: string; accept?: string[] }[] }
  }
}

/** Every file below a folder, as paths relative to it. */
function filesUnder(root: string): string[] {
  const found: string[] = []
  const walk = (folder: string) => {
    for (const name of readdirSync(folder)) {
      const path = join(folder, name)
      if (statSync(path).isDirectory()) walk(path)
      else found.push(relative(root, path))
    }
  }
  walk(root)
  return found
}

/** The files the service worker caches, as the build wrote them into `sw.js` (`url:"…"` or `"url":"…"`). */
export function precachedUrls(workerSource: string): string[] {
  return [...workerSource.matchAll(/"?url"?:"([^"]*)"/g)].map((match) => match[1])
}

/**
 * What is wrong with the build in `dist`, one sentence each; an empty list
 * means it is fine to publish.
 */
export function checkDist(dist: string): string[] {
  const problems: string[] = []
  if (!existsSync(dist)) return [`${dist} does not exist. Build first.`]
  const files = filesUnder(dist)

  // GitHub Pages (Jekyll) does not serve names starting with "_": one such
  // file in the precache makes the service worker's install fail (ADR-047).
  const hidden = files.filter((file) => file.split('/').some((part) => part.startsWith('_')))
  for (const file of hidden) {
    problems.push(`${file} would be hidden by GitHub Pages (a name starting with "_"), which stops the service worker from installing.`)
  }

  const workerPath = join(dist, 'sw.js')
  if (!existsSync(workerPath)) {
    problems.push('sw.js is missing, so the app would not work offline.')
  } else {
    const worker = readFileSync(workerPath, 'utf8')
    const urls = precachedUrls(worker)
    if (urls.length === 0) problems.push('sw.js lists no precached files, so the app would not work offline.')

    // A file listed twice with two revisions makes the install fail (ADR-022).
    for (const url of new Set(urls.filter((url, index) => urls.indexOf(url) !== index))) {
      problems.push(`sw.js precaches ${url} more than once, so its install fails.`)
    }
    // A listed file that is not there fails the install too.
    for (const url of urls) {
      if (!existsSync(join(dist, url))) problems.push(`sw.js precaches ${url}, which is not in the build.`)
    }
    if (!worker.includes('share-target')) problems.push('sw.js does not answer the share address, so sharing to OwnLedger would fail with 405.')
  }

  const manifestPath = join(dist, 'manifest.webmanifest')
  if (!existsSync(manifestPath)) {
    problems.push('manifest.webmanifest is missing, so the app cannot be installed.')
  } else {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest
    const target = manifest.share_target
    if (!target) {
      problems.push('The manifest has no share_target, so OwnLedger is not offered in the share sheet.')
    } else {
      if (target.method !== 'POST') problems.push('The share_target method must be POST.')
      if (target.enctype !== 'multipart/form-data') problems.push('The share_target must use multipart/form-data to receive files.')
      if (!manifest.scope || !target.action?.startsWith(manifest.scope)) problems.push('The share_target action must be inside the manifest scope.')
      const file = target.params?.files?.[0]
      if (file?.name !== 'receipts' || !file.accept?.includes('image/*')) problems.push('The share_target must accept image/* files in a field named "receipts".')
    }
  }

  if (!existsSync(join(dist, 'index.html'))) problems.push('index.html is missing.')
  return problems
}

if (import.meta.main) {
  const problems = checkDist(process.argv[2] ?? 'dist')
  if (problems.length > 0) {
    console.error('The build has problems:')
    for (const problem of problems) console.error(`- ${problem}`)
    process.exit(1)
  }
  console.log('The build looks fine.')
}
