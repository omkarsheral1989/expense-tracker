import { PlusOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { useNavigate } from 'react-router'
import { ROUTES } from '../../../../routes.ts'
import { PILL_RADIUS } from '../../../../theme/radius.ts'

type Props = {
  groupId: string
}

/**
 * The floating green button that opens the add-expense page. It stays at the
 * bottom of the screen, lined up with the right edge of the 720 px content
 * column (or 16 px from the screen's edge on a phone).
 */
export function AddExpenseButton({ groupId }: Props) {
  const navigate = useNavigate()

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 'max(16px, calc((100vw - 720px) / 2 + 16px))',
        zIndex: 10,
      }}
    >
      <Button
        type="primary"
        size="large"
        icon={<PlusOutlined />}
        onClick={() => navigate(ROUTES.newExpense(groupId))}
        style={{ borderRadius: PILL_RADIUS, boxShadow: '0 6px 16px rgba(0, 0, 0, 0.2)' }}
      >
        Add expense
      </Button>
    </div>
  )
}
