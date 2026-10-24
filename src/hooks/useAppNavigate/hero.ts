import { ROUTES } from '../../routes.ts'
import { RADIUS } from '../../theme/radius.ts'
import { GROUP_OPEN_MS, GROUP_OPEN_REST } from '../../theme/transition.ts'

/** The `view-transition-name` of each piece that travels between a row of a list and the band of the page it opens: a group's row and its page, an expense's row and its page (PRD 5.16). */
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
  // The dot between the two texts in the row, and the empty 0 x 0 px piece between the band's chips that it shrinks into.
  dot: 'group-dot',
  // The band's header row (Back, the title and the round buttons), which the row has nothing like: it comes in from the top.
  header: 'group-header',
  // A chip of the band that the row has nothing like either: it comes in from the right (the group's trip dates, the expense's category).
  dates: 'group-from-right',
  category: 'group-from-right',
  // An expense's amount ("$100.00" in "You paid $100.00"), which grows into the band's large amount.
  amount: 'group-amount',
  // An expense's day ("Oct 22" in the date column), and a box around it that grows into the band's date chip.
  date: 'group-date',
  dateChip: 'group-date-chip',
} as const


type Piece = keyof typeof GROUP_PIECE_NAMES

/** The group's page, with its id captured. */
const GROUP_PAGE = /^\/groups\/([0-9a-f-]{36})\/?$/i

/** An expense's page, with the group's and the expense's ids captured. */
const EXPENSE_PAGE = /^\/groups\/([0-9a-f-]{36})\/expenses\/([0-9a-f-]{36})\/?$/i

/** An address of the app without the site's base path ("/ownledger/groups/1" is "/groups/1"). */
export function routerPathOf(windowPath: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  return base && windowPath.startsWith(base) ? windowPath.slice(base.length) || '/' : windowPath
}

/**
 * Tells the CSS how long the morph lasts and what the rest of the screen does, read when the transition
 * starts (not once when the app opens, so a change to the settings applies at once).
 */
export function setGroupOpenStyle(root: HTMLElement, hero: GroupHero) {
  root.style.setProperty('--group-open-ms', `${GROUP_OPEN_MS}ms`)
  root.style.setProperty('--hero-block-radius', hero.blockRadius)
  root.dataset.groupRest = GROUP_OPEN_REST
}

/** What a row and the page it opens have to do for the morph between them. */
export type GroupHero = {
  /** `hero-open` from the list to the page, `hero-close` back. */
  direction: 'hero-open' | 'hero-close'
  /** The corners of the row's block (`border-radius`), which straighten into the band's square ones (`--hero-block-radius`). */
  blockRadius: string
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
  // The block's picture is taken with square corners, as a group's block is (its card clips it): rounded corners painted into the picture
  // (an expense's tile) would stretch with it into wide curves. The rounding is drawn instead by the clip on the morphing box, which
  // straightens from `--hero-block-radius` (`group-band-straighten`); the page is hidden behind the pictures while the corners are square.
  const blocks = named.filter((element) => element.dataset.vt === 'block' && element.style.borderRadius)
  const radii = blocks.map((element) => element.style.borderRadius)
  blocks.forEach((element) => (element.style.borderRadius = '0'))
  return () => {
    named.forEach((element) => element.style.removeProperty('view-transition-name'))
    blocks.forEach((element, index) => (element.style.borderRadius = radii[index]))
  }
}

/** Names one element, when it is there; returns what takes the name off. */
function nameOne(element: HTMLElement | null, name: string): () => void {
  element?.style.setProperty('view-transition-name', name)
  return () => element?.style.removeProperty('view-transition-name')
}

/** Runs each of the functions that take names off. */
const together = (...undo: (() => void)[]) => () => undo.forEach((run) => run())

/** The name of the page's content on the page left (`old`) and on the page that comes (`new`): it is the same element on both, so it needs a name for each. */
type PageContent = 'group-page-old' | 'group-page-new'

/**
 * The parts of the screen that are not pieces (PRD 5.16): everything the app draws in `#root` is one picture of its own, with no background, that
 * slides; the list's green wash (`data-page-tint`) and its header bar (`data-app-header`) are pictures too. What is left in the browser's picture of
 * the whole page is the page's plain background, which stays still, so the wash fades over it in place and the bar moves up.
 */
function nameScreen(content: PageContent): () => void {
  return together(
    nameOne(document.querySelector<HTMLElement>('#root > *'), content),
    nameOne(document.querySelector<HTMLElement>('[data-page-tint]'), 'group-tint'),
    nameOne(document.querySelector<HTMLElement>('[data-app-header]'), 'group-app-header'),
  )
}

/**
 * Names the page's floating button (`data-floating-button`): `group-floating-old` on the page left, which drops off the bottom of the screen,
 * `group-floating-new` on the page that comes, which rises from it. Two names, so Add expense and Create group do not morph into each other.
 */
const nameFloatingButton = (name: 'group-floating-old' | 'group-floating-new') =>
  nameOne(document.querySelector<HTMLElement>('[data-floating-button]'), name)

const rowOf = (groupId: string) => document.querySelector(`[data-group-row="${groupId}"]`)
const bandOf = () => document.querySelector('[data-group-band]')
/** An expense's row in the group's list; deleted expenses' lines have no mark, so they keep the plain slide. */
const expenseRowOf = (expenseId: string) => document.querySelector(`[data-expense-row="${expenseId}"]`)
/** The expense page's band; it has the mark only for a live expense (not a deleted one). */
const expenseBandOf = () => document.querySelector('[data-expense-band]')

/** A group's card has rounded left corners; an expense's category tile is rounded all round. */
const GROUP_ROW_RADIUS = `${RADIUS.outer}px 0 0 ${RADIUS.outer}px`
const EXPENSE_TILE_RADIUS = `${RADIUS.inner}px`

/**
 * The morph between a row of a list and the band of the page it opens, for a change from `from` to `to`
 * (router addresses), or null for any other change: the home list's row of a group and that group's page,
 * and the group page's row of an expense (or a payment) and that expense's page, both ways.
 * Only one row and one band are ever named at a time, since a name must be unique.
 */
export function groupHeroFor(from: string, to: string): GroupHero | null {
  const opened = GROUP_PAGE.exec(to)
  if (from === ROUTES.home && opened) {
    const id = opened[1]
    return {
      direction: 'hero-open',
      blockRadius: GROUP_ROW_RADIUS,
      before: () =>
        together(
          nameChildren(rowOf(id)),
          nameScreen('group-page-old'),
          // The list's floating Create group button drops off the bottom of the screen instead of sliding left.
          nameFloatingButton('group-floating-old'),
        ),
      // The group page's Add expense rises from the bottom of the screen instead of sliding in.
      after: () => together(nameChildren(bandOf()), nameScreen('group-page-new'), nameFloatingButton('group-floating-new')),
    }
  }
  const closed = GROUP_PAGE.exec(from)
  if (closed && to === ROUTES.home) {
    const id = closed[1]
    return {
      direction: 'hero-close',
      blockRadius: GROUP_ROW_RADIUS,
      // Going back, the group page's Add expense drops off the bottom and the list's Create group comes up from it.
      before: () => together(nameChildren(bandOf()), nameScreen('group-page-old'), nameFloatingButton('group-floating-old')),
      after: () => together(nameChildren(rowOf(id)), nameScreen('group-page-new'), nameFloatingButton('group-floating-new')),
    }
  }
  // An expense opened from the group's list: the group's band goes up off the screen (named like the list's header bar)
  // and its Add expense drops off the bottom, while the expense's row grows into the expense's band.
  const expenseOpened = EXPENSE_PAGE.exec(to)
  if (closed && expenseOpened && closed[1] === expenseOpened[1] && expenseRowOf(expenseOpened[2])) {
    const expenseId = expenseOpened[2]
    return {
      direction: 'hero-open',
      blockRadius: EXPENSE_TILE_RADIUS,
      before: () =>
        together(
          nameChildren(expenseRowOf(expenseId)),
          nameScreen('group-page-old'),
          nameOne(document.querySelector<HTMLElement>('[data-group-band]'), 'group-app-header'),
          nameFloatingButton('group-floating-old'),
        ),
      after: () => together(nameChildren(expenseBandOf()), nameScreen('group-page-new')),
    }
  }
  // Back from an expense to its group: the mirror. The row is found on the group page once it is on screen.
  const expenseClosed = EXPENSE_PAGE.exec(from)
  if (expenseClosed && opened && expenseClosed[1] === opened[1] && expenseBandOf()) {
    const expenseId = expenseClosed[2]
    return {
      direction: 'hero-close',
      blockRadius: EXPENSE_TILE_RADIUS,
      before: () => together(nameChildren(expenseBandOf()), nameScreen('group-page-old')),
      after: () =>
        together(
          nameChildren(expenseRowOf(expenseId)),
          nameScreen('group-page-new'),
          nameOne(document.querySelector<HTMLElement>('[data-group-band]'), 'group-app-header'),
          nameFloatingButton('group-floating-new'),
        ),
    }
  }
  return null
}
