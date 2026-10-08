import { Button } from 'antd'
import type { ReactNode } from 'react'
import { ComingSoon } from '../../../../../components/ComingSoon'

type Props = {
  icon: ReactNode
  /** What the button does, for screen readers. */
  label: string
  /** Leave out for a button whose feature is not built yet: it is switched off. */
  onClick?: () => void
}

/** A round white button with an icon, sitting on the colored band. */
export function BandIconButton({ icon, label, onClick }: Props) {
  const button = (
    <Button
      shape="circle"
      icon={icon}
      aria-label={label}
      disabled={!onClick}
      onClick={onClick}
      style={{ background: '#fff', color: '#262626', border: 'none' }}
    />
  )

  return onClick ? button : <ComingSoon>{button}</ComingSoon>
}
