// Raises the last number of package.json's version by one (1.0.7 becomes 1.0.8) and prints the new
// version. `bun run deploy:pages` runs it before building, so each deployment has its own version,
// shown on the About page (PRD 5.24). It changes the file only; the change is committed by hand.
import { readFileSync, writeFileSync } from 'node:fs'

const file = new URL('../package.json', import.meta.url)
const text = readFileSync(file, 'utf8')
const match = text.match(/("version":\s*")(\d+)\.(\d+)\.(\d+)(")/)
if (!match) {
  console.error('package.json has no version of the form 1.2.3')
  process.exit(1)
}

const [, before, major, minor, patch, after] = match
const next = `${major}.${minor}.${Number(patch) + 1}`
writeFileSync(file, text.replace(match[0], `${before}${next}${after}`))
console.log(next)
