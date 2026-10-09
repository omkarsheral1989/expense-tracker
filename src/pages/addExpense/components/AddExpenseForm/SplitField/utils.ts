import { computeShares } from '../../../../../services/expenseService/utils.ts'
import { groupService } from '../../../../../services/groupService'
import type { GroupMember } from '../../../../../services/groupService/types.ts'
import type { SplitValue } from '../types.ts'
import type { QuickChoice } from './types.ts'

/** How a sentence names a member: "you" for the user, otherwise their first name. */
export function nameInSentence(member: GroupMember): string {
  return member.isYou ? 'you' : groupService.shortName(member)
}

/** The split a new expense starts with: the user paid, split equally between everyone. */
export function initialSplit(members: readonly GroupMember[]): SplitValue {
  const you = members.find((member) => member.isYou) ?? members[0]
  return {
    paidBy: you.personId,
    method: 'equal',
    values: Object.fromEntries(members.map((member) => [member.personId, 1])),
  }
}

/**
 * The four choices of a two-member group: either of the two paid and it is
 * split equally, or either of them paid and the other owes it all.
 */
export function quickChoices(you: GroupMember, other: GroupMember): QuickChoice[] {
  const name = groupService.shortName(other)
  const equal = (paidBy: string, youShare: number, otherShare: number): SplitValue => ({
    paidBy,
    method: 'equal',
    values: { [you.personId]: youShare, [other.personId]: otherShare },
  })
  return [
    { label: 'You paid, split equally', value: equal(you.personId, 1, 1) },
    { label: 'You are owed the full amount', value: equal(you.personId, 0, 1) },
    { label: `${name} paid, split equally`, value: equal(other.personId, 1, 1) },
    { label: `${name} is owed the full amount`, value: equal(other.personId, 1, 0) },
  ]
}

/** Whether two splits are the same: same payer, method and numbers (a missing number is 0). */
export function sameSplit(a: SplitValue, b: SplitValue): boolean {
  const people = new Set([...Object.keys(a.values), ...Object.keys(b.values)])
  return (
    a.paidBy === b.paidBy &&
    a.method === b.method &&
    [...people].every((person) => (a.values[person] ?? 0) === (b.values[person] ?? 0))
  )
}

/**
 * Why the split cannot be saved with this amount, such as "The split no longer
 * adds up." after the amount changed under exact amounts; null when it can, or
 * when there is no amount yet to check it against.
 */
export function splitProblem(
  amountMinor: number | null,
  split: SplitValue,
  members: readonly GroupMember[],
): string | null {
  if (amountMinor === null || amountMinor <= 0) return null
  const result = computeShares(
    amountMinor,
    split,
    split.paidBy,
    members.map((member) => member.personId),
  )
  return result.ok ? null : result.message
}
