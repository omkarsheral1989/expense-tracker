import { useNavigate } from 'react-router'
import { FloatingPillButton } from '../../../../components/FloatingPillButton'
import { ROUTES } from '../../../../routes.ts'

type Props = {
  groupId: string
}

/** The floating green button that opens the add-expense page. */
export function AddExpenseButton({ groupId }: Props) {
  const navigate = useNavigate()

  return (
    <FloatingPillButton onClick={() => navigate(ROUTES.newExpense(groupId))}>
      Add expense
    </FloatingPillButton>
  )
}
