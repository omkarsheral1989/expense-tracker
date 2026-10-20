import type { ExpenseChange, SplitMethod } from '../../../../../db/types.ts'
import { dateService } from '../../../../../services/dateService'
import { expenseService } from '../../../../../services/expenseService'
import type { ExpenseHistoryEntry, ExpensePerson } from '../../../../../services/expenseService/types.ts'
import { moneyService } from '../../../../../services/moneyService'
import { SPLIT_METHOD_LABELS } from '../content.ts'
import { displayName } from '../utils.ts'

/** Text longer than this is cut, with "…", when a line quotes it. */
export const QUOTE_MAX_LENGTH = 80

/** One line of an edit's history, with the lines nested under it (a split's people). */
export type HistoryLine = {
  text: string
  nested?: string[]
}

type People = Record<string, ExpensePerson>

/** Text quoted in a line: 'Dinner', cut after `QUOTE_MAX_LENGTH` characters. */
function quote(text: string): string {
  return `'${text.length > QUOTE_MAX_LENGTH ? `${text.slice(0, QUOTE_MAX_LENGTH).trimEnd()}…` : text}'`
}

/** A person in the middle of a sentence ("you", "Priya Shah"). */
function whoInSentence(id: string | null, people: People): string {
  const person = id ? people[id] : undefined
  if (!person) return 'someone'
  return person.isYou ? 'you' : displayName(person)
}

/** A person at the start of a line ("You", "Priya Shah"). */
function whoAtStart(id: string, people: People): string {
  const name = whoInSentence(id, people)
  return name === 'you' ? 'You' : name
}

/** The category's name as the details page writes it. */
function categoryName(key: unknown): string {
  const category = expenseService.categoryOf(String(key))
  return category.label === 'Other' ? `${category.groupLabel}: Other` : category.label
}

/** A split method as a phrase after "split": "equally", "by percentages". */
function methodPhrase(method: SplitMethod): string {
  return SPLIT_METHOD_LABELS[method].replace(/^Split /, '')
}

/** What was entered for one person under a method, in the method's own units. */
function enteredText(method: SplitMethod, value: number, currency: string): string {
  switch (method) {
    case 'equal':
      return value > 0 ? 'in the split' : 'not in the split'
    case 'exact':
      return moneyService.format(value, currency)
    case 'percent':
      return `${value}%`
    case 'shares':
      return `${value} ${value === 1 ? 'share' : 'shares'}`
    case 'adjustment':
      return `+${moneyService.format(value, currency)}`
  }
}

type Split = { method: SplitMethod; values: Record<string, number> }

/** The person lines of a changed split: only those whose entered value reads differently. */
function splitPeopleLines(from: Split, to: Split, people: People, currencies: { from: string; to: string }): string[] {
  const ids = [...new Set([...Object.keys(from.values), ...Object.keys(to.values)])]
  const label = (id: string) => whoAtStart(id, people)
  return ids
    .toSorted((a, b) => Number(people[b]?.isYou ?? false) - Number(people[a]?.isYou ?? false) || label(a).localeCompare(label(b)))
    .flatMap((id) => {
      const before = enteredText(from.method, from.values[id] ?? 0, currencies.from)
      const after = enteredText(to.method, to.values[id] ?? 0, currencies.to)
      return before === after ? [] : [`${label(id)}: ${before} to ${after}`]
    })
}

function lineFor(change: ExpenseChange, entry: ExpenseHistoryEntry, people: People): HistoryLine[] {
  const currencyChange = entry.changes.find((other) => other.field === 'currency')
  const currencies = { from: entry.currencyBefore, to: String(currencyChange?.to ?? entry.currencyBefore) }

  switch (change.field) {
    case 'description':
      return [{ text: `Description changed from ${quote(String(change.from))} to ${quote(String(change.to))}` }]
    case 'notes':
      if (change.from === null) return [{ text: `Notes added: ${quote(String(change.to))}` }]
      if (change.to === null) return [{ text: `Notes removed (were ${quote(String(change.from))})` }]
      return [{ text: `Notes changed from ${quote(String(change.from))} to ${quote(String(change.to))}` }]
    case 'category':
      return [{ text: `Category changed from ${categoryName(change.from)} to ${categoryName(change.to)}` }]
    case 'amount':
      return [
        {
          text: `Cost changed from ${moneyService.format(Number(change.from), currencies.from)} to ${moneyService.format(Number(change.to), currencies.to)}`,
        },
      ]
    case 'currency':
      // With a new cost, each amount already shows its own currency.
      if (entry.changes.some((other) => other.field === 'amount')) return []
      return [{ text: `Currency changed from ${String(change.from)} to ${String(change.to)}` }]
    case 'date':
      return [{ text: `Date changed from ${dateService.formatDate(String(change.from))} to ${dateService.formatDate(String(change.to))}` }]
    case 'paidBy':
      return [{ text: `Paid by changed from ${whoInSentence(change.from as string, people)} to ${whoInSentence(change.to as string, people)}` }]
    case 'split': {
      const from = change.from as Split
      const to = change.to as Split
      const nested = splitPeopleLines(from, to, people, currencies)
      const text =
        from.method === to.method
          ? 'Split changed'
          : `Split changed from ${methodPhrase(from.method)} to ${methodPhrase(to.method)}`
      return [nested.length > 0 ? { text, nested } : { text }]
    }
    case 'receipts': {
      const from = change.from as string[]
      const to = change.to as string[]
      const added = to.filter((id) => !from.includes(id)).length
      const removed = from.filter((id) => !to.includes(id)).length
      const photos = (count: number) => `${count} ${count === 1 ? 'photo' : 'photos'}`
      return [
        ...(added > 0 ? [{ text: `${photos(added)} added` }] : []),
        ...(removed > 0 ? [{ text: `${photos(removed)} removed` }] : []),
      ]
    }
  }
}

/** The order an edit's lines are written in. */
const FIELD_ORDER: ExpenseChange['field'][] = [
  'description',
  'notes',
  'category',
  'amount',
  'currency',
  'date',
  'paidBy',
  'split',
  'receipts',
]

/**
 * What one edit changed, as lines for the history: "Cost changed from ₹100.00
 * to ₹120.00", "Description changed from 'Dinner' to 'Lunch'", a split with a
 * nested line for each person whose entered value differs, "2 photos added".
 * `people` names everyone the changes refer to.
 */
export function historyLines(entry: ExpenseHistoryEntry, people: People): HistoryLine[] {
  return entry.changes
    .toSorted((a, b) => FIELD_ORDER.indexOf(a.field) - FIELD_ORDER.indexOf(b.field))
    .flatMap((change) => lineFor(change, entry, people))
}

/** The header of an edit or of the expense's creation: "You edited this expense". */
export function historyHeader(by: { isYou: boolean; name: string | null; email: string | null }, did: 'edited' | 'added'): string {
  return `${displayName(by)} ${did} this expense`
}
