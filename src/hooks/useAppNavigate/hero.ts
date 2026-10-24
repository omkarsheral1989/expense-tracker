import { ROUTES } from '../../routes.ts'
import { GROUP_OPEN_MS, GROUP_OPEN_REST } from '../../theme/transition.ts'

/** The `view-transition-name` of each piece that travels between a group's row and its page (PRD 5.16). */
const GROUP_PIECE_NAMES = {
  block: 'group-band',
  icon: 'group-icon',
  name: 'group-name',
  currency: 'group-currency',
  people: 'group-people',
  // The pills of the band's currency and members chips, which a plain box around each text in the row grows into.
  currencyChip: 'group-currency-chip',
  peopleChip: 'group-people-chip',
  // The members icon of the band's chip, and the empty 0 x 0 px piece in the row that grows into it.
  peopleIcon: 'group-people-icon',
  // The band's header row (Back, the title and the round buttons), which the row has nothing like: it comes in from the top.
  header: 'group-header',
  // The band's trip dates chip, which the row has nothing like either: it comes in from the right.
  dates: 'group-dates',
} as const


type Piece = keyof typeof GROUP_PIECE_NAMES

/** The group's page, with its id captured. */
const GROUP_PAGE = /^\/groups\/([0-9a-f-]{36})\/?$/i

/** An address of the app without the site's base path ("/ownledger/groups/1" is "/groups/1"). */
export function routerPathOf(windowPath: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  return base && windowPath.startsWith(base) ? windowPath.slice(base.length) || '/' : windowPath
}

/**
 * Tells the CSS how long the morph lasts and what the rest of the screen does, read when the transition
 * starts (not once when the app opens, so a change to the settings applies at once).
 */
export function setGroupOpenStyle(root: HTMLElement) {
  root.style.setProperty('--group-open-ms', `${GROUP_OPEN_MS}ms`)
  root.dataset.groupRest = GROUP_OPEN_REST
}

/** What a group's row and its page have to do for the morph between them. */
export type GroupHero = {
  /** `open-group` from the list to the page, `close-group` back. */
  direction: 'open-group' | 'close-group'
  /** Names the old page's pieces, before the browser takes its picture; returns what removes the names. */
  before: () => () => void
  /** Names the new page's pieces, once it is on screen and before the browser takes its picture of it; returns what removes the names. */
  after: () => () => void
}

/** Gives each `[data-vt]` piece inside `root` its name, and returns a function that takes the names off again. */
function nameChildren(root: Element | null): () => void {
  const named: HTMLElement[] = []
  root?.querySelectorAll<HTMLElement>('[data-vt]').forEach((element) => {
    const name = GROUP_PIECE_NAMES[element.dataset.vt as Piece]
    if (!name) return
    element.style.setProperty('view-transition-name', name)
    named.push(element)
  })
  // The root itself is a piece when it says so (the band).
  if (root instanceof HTMLElement && root.dataset.vt && GROUP_PIECE_NAMES[root.dataset.vt as Piece]) {
    root.style.setProperty('view-transition-name', GROUP_PIECE_NAMES[root.dataset.vt as Piece])
    named.push(root)
  }
  return () => named.forEach((element) => element.style.removeProperty('view-transition-name'))
}

const rowOf = (groupId: string) => document.querySelector(`[data-group-row="${groupId}"]`)
const bandOf = () => document.querySelector('[data-group-band]')

/**
 * The morph between the home list's row of a group and that group's page, for a
 * change from `from` to `to` (router addresses), or null for any other change.
 * Only one row and one band are ever named at a time, since a name must be unique.
 */
export function groupHeroFor(from: string, to: string): GroupHero | null {
  const opened = GROUP_PAGE.exec(to)
  if (from === ROUTES.home && opened) {
    const id = opened[1]
    return { direction: 'open-group', before: () => nameChildren(rowOf(id)), after: () => nameChildren(bandOf()) }
  }
  const closed = GROUP_PAGE.exec(from)
  if (closed && to === ROUTES.home) {
    const id = closed[1]
    return { direction: 'close-group', before: () => nameChildren(bandOf()), after: () => nameChildren(rowOf(id)) }
  }
  return null
}
