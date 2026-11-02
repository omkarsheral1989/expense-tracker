// The version the About page shows (PRD 5.24): package.json's, raised by one for each deployment by
// `bun run deploy:pages`, and put into the build by vite.config.ts.
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = new URL('../../', import.meta.url)

/** Runs a copy of the bump script next to a package.json of its own, and says what it printed and what the file holds after. */
function bump(packageJson: string) {
  const dir = mkdtempSync(join(tmpdir(), 'bump-version-'))
  cpSync(new URL('scripts', root), join(dir, 'scripts'), { recursive: true })
  writeFileSync(join(dir, 'package.json'), packageJson)
  const printed = execFileSync('node', [join(dir, 'scripts/bump-version.mjs')], { encoding: 'utf8' }).trim()
  return { printed, after: readFileSync(join(dir, 'package.json'), 'utf8') }
}

describe('scripts/bump-version.mjs', () => {
  it('raises the last number of the version by one, prints it, and changes nothing else in the file', () => {
    const before = '{\n  "name": "x",\n  "version": "1.0.9",\n  "scripts": { "build": "vite build" }\n}\n'

    const { printed, after } = bump(before)

    expect(printed).toBe('1.0.10')
    expect(after).toBe(before.replace('1.0.9', '1.0.10'))
  })

  it('keeps the other numbers', () => {
    expect(bump('{ "version": "3.4.5" }').printed).toBe('3.4.6')
  })

  it('stops when the file has no version of the form 1.2.3', () => {
    expect(() => bump('{ "version": "next" }')).toThrow()
  })
})

describe('the version in the build', () => {
  it('starts as a plain three-number version in package.json', () => {
    const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as { version: string }

    expect(version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('is put into the build from package.json, as __APP_VERSION__, which src/version.ts exports', () => {
    const config = readFileSync(new URL('vite.config.ts', root), 'utf8')
    const version = readFileSync(new URL('src/version.ts', root), 'utf8')

    expect(config).toContain("new URL('./package.json', import.meta.url)")
    expect(config).toContain('__APP_VERSION__: JSON.stringify(version)')
    expect(version).toContain('export const APP_VERSION = __APP_VERSION__')
  })

  it('is raised by the deploy script before it builds, and only there', () => {
    const deploy = readFileSync(new URL('scripts/deploy-pages.sh', root), 'utf8')
    const packageJson = readFileSync(new URL('package.json', root), 'utf8')

    expect(deploy.indexOf('node scripts/bump-version.mjs')).toBeGreaterThan(0)
    expect(deploy.indexOf('node scripts/bump-version.mjs')).toBeLessThan(deploy.indexOf('bun run build'))
    // A normal build must not change the version.
    expect(packageJson).not.toMatch(/"(build|dev|check:build)": "[^"]*bump-version/)
  })
})
