import { Flex } from 'antd'
import type { CurrencyBalance } from '../../../../services/expenseService/types.ts'
import type { SpentInCurrency } from '../../../../services/totalsService/types.ts'
import type { GroupSummary } from '../../../../services/groupService/types.ts'
import { GroupRow } from './GroupRow'

type Props = {
  /** In the order to show them, already sorted. */
  groups: GroupSummary[]
  /** The user's balance in each group, keyed by group id; a settled group has no entry. */
  balances: Record<string, CurrencyBalance[]>
  /** What each group has spent per currency, keyed by group id, shown by a group of one instead of a balance. */
  spent: Record<string, SpentInCurrency[]>
}

export function GroupList({ groups, balances, spent }: Props) {
  function renderGroup(group: GroupSummary) {
    return <GroupRow key={group.id} group={group} balances={balances[group.id] ?? []} spent={spent[group.id] ?? []} />
  }

  return (
    <Flex vertical gap={12}>
      {groups.map(renderGroup)}
    </Flex>
  )
}
