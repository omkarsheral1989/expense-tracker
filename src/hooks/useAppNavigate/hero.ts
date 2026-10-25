import { ROUTES } from '../../routes.ts'
import { RADIUS } from '../../theme/radius.ts'
import { FLOATING_BUTTON_HEIGHT } from '../../components/FloatingPillButton/constants.ts'
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
  // Chips of the band that the row has nothing like either: they come in from the right (the group's trip dates, the expense's day and category).
  dates: 'group-from-right',
  chips: 'group-from-right',
  // An expense's amount ("$100.00" in "You paid $100.00"), which grows into the band's large amount.
  amount: 'group-amount',
  // The plus and label of the floating Create group pill, which fade while the pill grows into Create group's page.
  pillLabel: 'group-pill-label',
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
  root.dataset.heroKind = hero.kind ?? 'row'
}

/** What a row and the page it opens have to do for the morph between them. */
export type GroupHero = {
  /** `hero-open` from the list to the page, `hero-close` back. */
  direction: 'hero-open' | 'hero-close'
  /** The corners of the row's block (`border-radius`), which straighten into the band's square ones (`--hero-block-radius`). */
  blockRadius: string
  /**
   * `create` when the floating Create group pill grows into Create group's whole page (the CSS layers and fades it differently,
   * `data-hero-kind`); left out for a row growing into a band.
   */
  kind?: 'create'
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

/** The floating pill (`data-floating-button`) and the page's color wash (`data-page-tint`), the two ends of Create group's transition. */
const floatingButtonOf = () => document.querySelector<HTMLElement>('[data-floating-button]')
const tintOf = () => document.querySelector<HTMLElement>('[data-page-tint]')
const contentOf = () => document.querySelector<HTMLElement>('#root > *')
/** Create group's header row (Back and the title), which comes in from the top like a band's header. */
const nameCreateHeader = () => nameOne(document.querySelector<HTMLElement>('[data-vt="header"]'), 'group-header')
/** Half the floating pill's height: its round ends, which straighten as it fills the screen. */
const PILL_END_RADIUS = `${FLOATING_BUTTON_HEIGHT / 2}px`

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
  // The floating Create group pill grows into the whole of Create group's page: the pill (a square block in its rounded frame) and the page's
  // color wash share the band's name, so the pill's green grows into the wash; the list slides away and the form fades in over the wash.
  if (from === ROUTES.home && to === ROUTES.newGroup) {
    return {
      direction: 'hero-open',
      kind: 'create',
      blockRadius: PILL_END_RADIUS,
      before: () => together(nameChildren(floatingButtonOf()), nameScreen('group-page-old')),
      after: () => together(nameOne(tintOf(), 'group-band'), nameOne(contentOf(), 'group-page-new'), nameCreateHeader()),
    }
  }
  if (from === ROUTES.newGroup && to === ROUTES.home) {
    return {
      direction: 'hero-close',
      kind: 'create',
      blockRadius: PILL_END_RADIUS,
      before: () => together(nameOne(tintOf(), 'group-band'), nameOne(contentOf(), 'group-page-old'), nameCreateHeader()),
      after: () => together(nameChildren(floatingButtonOf()), nameScreen('group-page-new')),
    }
  }
  return null
}
