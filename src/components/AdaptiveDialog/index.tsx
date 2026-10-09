import { Drawer, Grid, Modal } from 'antd'
import type { ReactNode } from 'react'

type Props = {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  /**
   * True for a long list (such as every currency): on a phone the sheet then
   * takes most of the screen's height. False (the default) for short content
   * (a calendar): the sheet is only as tall as what it holds.
   */
  tall?: boolean
  /** Shown under the content, always in view (for example totals and a Done button). */
  footer?: ReactNode
}

/**
 * A dialog for picking something: centered on wider screens and a sheet that
 * slides up from the bottom on phones. Closes with its close button or by
 * tapping outside.
 */
export function AdaptiveDialog({ open, onClose, title, children, tall = false, footer }: Props) {
  const screens = Grid.useBreakpoint()

  if (screens.md) {
    return (
      <Modal
        open={open}
        onCancel={onClose}
        title={title}
        footer={footer ?? null}
        centered
        destroyOnHidden
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      >
        {children}
      </Modal>
    )
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={title}
      placement="bottom"
      size={tall ? '85vh' : 'auto'}
      destroyOnHidden
      footer={footer}
      styles={{ wrapper: { maxHeight: '85vh' } }}
    >
      {children}
    </Drawer>
  )
}
