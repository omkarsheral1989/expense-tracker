import { SyncOutlined } from '@ant-design/icons'
import { Button, Tooltip } from 'antd'

type Props = {
  /** Shown on hover: what the button does, or when the last sync finished. */
  tip: string
  /** True while a sync runs: the icon spins. */
  spinning?: boolean
  /** True on a group's colored band: white with no border, like the band's other round buttons. */
  onBand?: boolean
  onClick: () => void
}

/** The round Sync button: two circling arrows, which spin while a sync runs (ADR-044). */
export function SyncIconButton({ tip, spinning = false, onBand = false, onClick }: Props) {
  return (
    <Tooltip title={tip}>
      <Button
        shape="circle"
        aria-label="Sync"
        icon={<SyncOutlined spin={spinning} />}
        onClick={onClick}
        style={onBand ? { background: '#fff', color: '#262626', border: 'none' } : undefined}
      />
    </Tooltip>
  )
}
