import { Drawer, Grid, Modal } from 'antd'
import type { ReactNode } from 'react'
import { useCloseOnBack } from '../../hooks/useCloseOnBack'
import { aboveScreenEdge } from '../../theme/safeArea.ts'

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
  /**
   * False for a dialog that must stay until its work is done (the sync
   * progress): it has no close button and ignores a click outside and Escape,
   * and the app behind it stays dimmed. True (the default) for every picker.
   */
  dismissible?: boolean
}

/**
 * A dialog for picking something: centered on wider screens and a sheet that
 * slides up from the bottom on phones. Closes with its close button or by
 * tapping outside.
 */
export function AdaptiveDialog({ open, onClose, title, children, tall = false, footer, dismissible = true }: Props) {
  const screens = Grid.useBreakpoint()
  // The browser's Back closes it (PRD 5.19), unless it must stay.
  useCloseOnBack(open, onClose, dismissible)

  if (screens.md) {
    return (
      <Modal
        open={open}
        onCancel={onClose}
        title={title}
        footer={footer ?? null}
        centered
        closable={dismissible}
        maskClosable={dismissible}
        keyboard={dismissible}
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
      closable={dismissible}
      maskClosable={dismissible}
      keyboard={dismissible}
      size={tall ? '85vh' : 'auto'}
      destroyOnHidden
      footer={footer}
      // The sheet ends at the screen's edge: keep its last row and buttons clear of the rounded corners.
      styles={{
        wrapper: { maxHeight: '85vh' },
        body: footer ? undefined : { paddingBottom: aboveScreenEdge(24) },
        footer: { paddingBottom: aboveScreenEdge(16) },
      }}
    >
      {children}
    </Drawer>
  )
}
