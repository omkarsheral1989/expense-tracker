// @vitest-environment jsdom
// Which page changes morph, and which pieces travel (PRD 5.16, ADR-060). How it looks is checked in a browser; here, the pairs and the names.
import { afterEach, describe, expect, it } from 'vitest'
import { ROUTES } from '../../../routes.ts'
import { groupHeroFor, routerPathOf, setGroupOpenStyle } from '../hero.ts'

const GROUP = '11111111-1111-4111-8111-111111111111'
const EXPENSE = '22222222-2222-4222-8222-222222222222'

/** Puts `html` on the page as the app's content (`#root > *`). */
function page(html: string) {
  document.body.innerHTML = `<div id="root"><div>${html}</div></div>`
}

const nameOf = (selector: string) => document.querySelector<HTMLElement>(selector)?.style.getPropertyValue('view-transition-name') ?? null
const content = () => nameOf('#root > *')

/** A group's row on the home list, as `GroupRow` marks it. */
const GROUP_ROW = `
  <a data-group-row="${GROUP}">
    <div data-vt="block"><span data-vt="icon"></span></div>
    <span data-vt="name"></span>
    <span data-vt="currencyChip"><span data-vt="currency"></span></span>
    <span data-vt="dot"></span>
    <span data-vt="peopleChip"><span data-vt="peopleIcon"></span><span data-vt="people"></span></span>
  </a>`

/** A group's band, as `GroupBand` marks it. */
const GROUP_BAND = `
  <div data-group-band data-vt="block">
    <div data-vt="header"></div>
    <span data-vt="icon"></span>
    <h2 data-vt="name"></h2>
    <button data-vt="currencyChip"><span data-vt="currency"></span></button>
    <span data-vt="dot"></span>
    <button data-vt="peopleChip"><span data-vt="peopleIcon"></span><span data-vt="people"></span></button>
    <span data-vt="dates"></span>
  </div>`

const FLOATING_BUTTON = `<div data-floating-button><button data-vt="block"><span data-vt="pillLabel"></span></button></div>`
const TINT = `<div data-page-tint></div>`

afterEach(() => {
  document.body.innerHTML = ''
})

describe('groupHeroFor', () => {
  it('pairs the home list with a group, both ways, starting from the card\'s rounded left corners', () => {
    expect(groupHeroFor(ROUTES.home, ROUTES.group(GROUP))).toMatchObject({ direction: 'hero-open', blockRadius: '20px 0 0 20px' })
    expect(groupHeroFor(ROUTES.group(GROUP), ROUTES.home)).toMatchObject({ direction: 'hero-close', blockRadius: '20px 0 0 20px' })
  })

  it('names the row\'s pieces, the screen and the floating button before the picture, and takes the names off again', () => {
    page(`<header data-app-header></header>${TINT}${GROUP_ROW}${FLOATING_BUTTON}`)
    const undo = groupHeroFor(ROUTES.home, ROUTES.group(GROUP))!.before()

    expect(nameOf('[data-group-row] [data-vt="block"]')).toBe('group-band')
    expect(nameOf('[data-group-row] [data-vt="icon"]')).toBe('group-icon')
    expect(nameOf('[data-group-row] [data-vt="name"]')).toBe('group-name')
    expect(nameOf('[data-group-row] [data-vt="people"]')).toBe('group-people')
    expect(content()).toBe('group-page-old')
    expect(nameOf('[data-page-tint]')).toBe('group-tint')
    expect(nameOf('[data-app-header]')).toBe('group-app-header')
    expect(nameOf('[data-floating-button]')).toBe('group-floating-old')

    undo()
    expect(nameOf('[data-group-row] [data-vt="block"]')).toBe('')
    expect(content()).toBe('')
    expect(nameOf('[data-floating-button]')).toBe('')
  })

  it('names only the row of the group that opens', () => {
    page(`${GROUP_ROW}<a data-group-row="other"><div data-vt="block"></div></a>`)
    groupHeroFor(ROUTES.home, ROUTES.group(GROUP))!.before()

    expect(nameOf('[data-group-row="other"] [data-vt="block"]')).toBe('')
  })

  it('pairs a live expense\'s row with its page, from the tile\'s 10 px corners, and nothing for a row that is not there (a deleted line)', () => {
    page(`<a data-expense-row="${EXPENSE}"><div data-vt="block"></div></a>`)
    expect(groupHeroFor(ROUTES.group(GROUP), ROUTES.expense(GROUP, EXPENSE))).toMatchObject({ direction: 'hero-open', blockRadius: '10px' })

    page('<p>A deleted line has no mark.</p>')
    expect(groupHeroFor(ROUTES.group(GROUP), ROUTES.expense(GROUP, EXPENSE))).toBeNull()
  })

  it('pairs an expense\'s page with its group only while the expense has a band (not a deleted one)', () => {
    page('<div data-expense-band></div>')
    expect(groupHeroFor(ROUTES.expense(GROUP, EXPENSE), ROUTES.group(GROUP))).toMatchObject({ direction: 'hero-close' })

    page('<p>A deleted expense\'s band has no mark.</p>')
    expect(groupHeroFor(ROUTES.expense(GROUP, EXPENSE), ROUTES.group(GROUP))).toBeNull()
  })

  it('grows the floating Create group pill into Create group\'s page, and shrinks it back', () => {
    expect(groupHeroFor(ROUTES.home, ROUTES.newGroup)).toMatchObject({ direction: 'hero-open', kind: 'pill', blockRadius: '24px' })
    expect(groupHeroFor(ROUTES.newGroup, ROUTES.home)).toMatchObject({ direction: 'hero-close', kind: 'pill' })
  })

  it('grows the group page\'s Add expense and Settle up pills into their pages, each from its own round ends', () => {
    expect(groupHeroFor(ROUTES.group(GROUP), ROUTES.newExpense(GROUP))).toMatchObject({ direction: 'hero-open', kind: 'pill', blockRadius: '24px' })
    expect(groupHeroFor(ROUTES.group(GROUP), ROUTES.settleUp(GROUP))).toMatchObject({ direction: 'hero-open', kind: 'pill', blockRadius: '20px' })
    expect(groupHeroFor(ROUTES.settleUp(GROUP), ROUTES.group(GROUP))).toMatchObject({ direction: 'hero-close', kind: 'pill' })
    // Only into the same group's pages.
    expect(groupHeroFor(ROUTES.group(GROUP), ROUTES.settleUp(EXPENSE))).toBeNull()
  })

  it('names the Settle up pill\'s square button, the wash and the page that comes when Settle up opens', () => {
    page(`${GROUP_BAND}<span data-settle-pill><button data-vt="block"><span data-vt="pillLabel"></span></button></span>`)
    const hero = groupHeroFor(ROUTES.group(GROUP), ROUTES.settleUp(GROUP))!
    hero.before()

    expect(nameOf('[data-settle-pill] [data-vt="block"]')).toBe('group-band')
    expect(nameOf('[data-settle-pill] [data-vt="pillLabel"]')).toBe('group-pill-label')
    expect(nameOf('[data-group-band]')).toBe('group-app-header')

    page(`${TINT}<div data-vt="header"></div>`)
    hero.after()
    expect(nameOf('[data-page-tint]')).toBe('group-band')
    expect(content()).toBe('group-page-new')
    expect(nameOf('[data-vt="header"]')).toBe('group-header')
  })

  it('grows Create group\'s chosen type tile into the new group\'s band, the other tiles staying where they are', () => {
    page(`
      <div class="group-type-selector">
        <label class="ant-segmented-item ant-segmented-item-selected"><div data-vt="block"><span data-vt="icon"></span></div></label>
        <label class="ant-segmented-item"><div data-vt="block" id="home-tile"><span data-vt="icon"></span></div></label>
      </div>`)
    const hero = groupHeroFor(ROUTES.newGroup, ROUTES.group(GROUP))!
    expect(hero).toMatchObject({ direction: 'hero-open', kind: 'form', blockRadius: '10px' })
    hero.before()

    expect(nameOf('.ant-segmented-item-selected [data-vt="block"]')).toBe('group-band')
    expect(nameOf('.ant-segmented-item-selected [data-vt="icon"]')).toBe('group-icon')
    expect(nameOf('#home-tile')).toBe('')
    expect(content()).toBe('group-page-old')
  })

  it('brings the new group\'s chips in as whole pills, their texts, icon and dot not travelling on their own', () => {
    page(`${GROUP_BAND}${FLOATING_BUTTON}`)
    groupHeroFor(ROUTES.newGroup, ROUTES.group(GROUP))!.after()

    expect(nameOf('[data-group-band]')).toBe('group-band')
    expect(nameOf('[data-group-band] [data-vt="name"]')).toBe('group-name')
    expect(nameOf('[data-group-band] [data-vt="currencyChip"]')).toBe('group-currency-chip')
    expect(nameOf('[data-group-band] [data-vt="peopleChip"]')).toBe('group-people-chip')
    expect(nameOf('[data-group-band] [data-vt="currency"]')).toBe('')
    expect(nameOf('[data-group-band] [data-vt="people"]')).toBe('')
    expect(nameOf('[data-group-band] [data-vt="peopleIcon"]')).toBe('')
    expect(nameOf('[data-group-band] [data-vt="dot"]')).toBe('')
    expect(nameOf('[data-floating-button]')).toBe('group-floating-new')
  })

  it('has nothing for other page changes', () => {
    expect(groupHeroFor(ROUTES.home, ROUTES.members)).toBeNull()
    expect(groupHeroFor(ROUTES.group(GROUP), ROUTES.editGroup(GROUP))).toBeNull()
    expect(groupHeroFor(ROUTES.newGroup, ROUTES.members)).toBeNull()
  })
})

describe('setGroupOpenStyle', () => {
  it('tells the CSS the length of the morph, the corners it starts from and the kind', () => {
    const root = document.documentElement
    setGroupOpenStyle(root, { direction: 'hero-open', blockRadius: '12px', kind: 'form', before: () => () => {}, after: () => () => {} })

    expect(root.style.getPropertyValue('--group-open-ms')).toBe('600ms')
    expect(root.style.getPropertyValue('--hero-block-radius')).toBe('12px')
    expect(root.dataset.heroKind).toBe('form')

    setGroupOpenStyle(root, { direction: 'hero-open', blockRadius: '24px', before: () => () => {}, after: () => () => {} })
    expect(root.dataset.heroKind).toBe('row')
  })
})

describe('routerPathOf', () => {
  it('takes the site\'s base path off an address', () => {
    expect(routerPathOf(`${import.meta.env.BASE_URL}groups/${GROUP}`)).toBe(`/groups/${GROUP}`)
  })
})
