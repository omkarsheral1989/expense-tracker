import { CloudSyncOutlined } from '@ant-design/icons'
import { Button, Tooltip } from 'antd'

type Props = {
  /** Shown on hover: what the button does, or when the last sync finished. */
  tip: string
  /** True while a sync or restore runs: the icon spins. */
  spinning?: boolean
  onClick: () => void
}

/** The round Sync button: a cloud with arrows (ADR-044). */
export function SyncIconButton({ tip, spinning = false, onClick }: Props) {
  return (
    <Tooltip title={tip}>
      <Button
        shape="circle"
        aria-label="Sync"
        icon={<CloudSyncOutlined spin={spinning} />}
        onClick={onClick}
      />
    </Tooltip>
  )
}
