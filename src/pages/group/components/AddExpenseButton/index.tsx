import { PlusOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { ComingSoon } from '../../../../components/ComingSoon'
import { PILL_RADIUS } from '../GroupBand/style.ts'

/**
 * The floating green button that will open the add-expense form. It stays at
 * the bottom of the screen, lined up with the right edge of the 720 px content
 * column (or 16 px from the screen's edge on a phone). Switched off for now.
 */
export function AddExpenseButton() {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 'max(16px, calc((100vw - 720px) / 2 + 16px))',
        zIndex: 10,
      }}
    >
      <ComingSoon>
        <Button
          type="primary"
          size="large"
          icon={<PlusOutlined />}
          disabled
          style={{ borderRadius: PILL_RADIUS, boxShadow: '0 6px 16px rgba(0, 0, 0, 0.2)' }}
        >
          Add expense
        </Button>
      </ComingSoon>
    </div>
  )
}
