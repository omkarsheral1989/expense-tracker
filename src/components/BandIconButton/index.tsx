import { Button } from 'antd'
import type { ReactNode } from 'react'
import { ComingSoon } from '../ComingSoon'

type Props = {
  icon: ReactNode
  /** What the button does, for screen readers. */
  label: string
  /** Leave out for a button whose feature is not built yet: it is switched off. */
  onClick?: () => void
  /** Shows the button busy while what it does is running. */
  loading?: boolean
  /** Switched off for now, with no tip, because what it needs is still loading. Takes `onClick` as given, so it is left out too. */
  disabled?: boolean
}

/** A round white button with an icon, sitting on a colored band (a group's page, an expense's page). */
export function BandIconButton({ icon, label, onClick, loading, disabled }: Props) {
  const button = (
    <Button
      shape="circle"
      icon={icon}
      aria-label={label}
      disabled={disabled || !onClick}
      loading={loading}
      onClick={onClick}
      style={{ background: '#fff', color: '#262626', border: 'none' }}
    />
  )

  return onClick || disabled ? button : <ComingSoon>{button}</ComingSoon>
}
