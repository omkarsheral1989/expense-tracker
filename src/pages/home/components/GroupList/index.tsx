import { Flex } from 'antd'
import type { CurrencyBalance } from '../../../../services/expenseService/types.ts'
import type { GroupSummary } from '../../../../services/groupService/types.ts'
import { GroupRow } from './GroupRow'

type Props = {
  /** In the order to show them, already sorted. */
  groups: GroupSummary[]
  /** The user's balance in each group, keyed by group id; a settled group has no entry. */
  balances: Record<string, CurrencyBalance[]>
}

export function GroupList({ groups, balances }: Props) {
  function renderGroup(group: GroupSummary) {
    return <GroupRow key={group.id} group={group} balances={balances[group.id] ?? []} />
  }

  return (
    <Flex vertical gap={12}>
      {groups.map(renderGroup)}
    </Flex>
  )
}
