import { useNavigate } from 'react-router'
import { FloatingPillButton } from '../../../../components/FloatingPillButton'
import { ROUTES } from '../../../../routes.ts'

import type { KnownGroup } from '../../types.ts'

type Props = {
  groupId: string
  /** What the page knows of the group, handed on so the add-expense page can show it while it loads (ADR-054). */
  group?: KnownGroup
}

/** The floating green button that opens the add-expense page. */
export function AddExpenseButton({ groupId, group }: Props) {
  const navigate = useNavigate()

  return (
    <FloatingPillButton onClick={() => navigate(ROUTES.newExpense(groupId), { state: group && { group } })}>
      Add expense
    </FloatingPillButton>
  )
}
