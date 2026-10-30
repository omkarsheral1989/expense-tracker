import { Button } from 'antd'
import { Icon } from '../../../../components/Icon'
import { PILL_RADIUS } from '../../../../theme/radius.ts'

type Props = {
  /** Shows the button busy while the restoring runs. */
  loading?: boolean
  /** Left out, with `disabled`, while the expense is still loading. */
  onClick?: () => void
  disabled?: boolean
}

/** The white pill on a deleted expense's band that brings it back: an undo icon and the word "Restore". */
export function RestoreButton({ loading, onClick, disabled }: Props) {
  return (
    <Button
      icon={<Icon name="undo" />}
      loading={loading}
      disabled={disabled}
      onClick={onClick}
      style={{ borderRadius: PILL_RADIUS, background: '#fff', color: '#262626', border: 'none' }}
    >
      Restore
    </Button>
  )
}
