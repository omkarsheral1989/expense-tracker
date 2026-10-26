import { Drawer, Grid, Modal } from 'antd'
import type { ReactNode } from 'react'
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
  /**
   * True to give the sheet or dialog the page's own light grey background, so white fields stand out on it as on a page (the accounts dialog).
   * False (the default) leaves it white.
   */
  pageBackground?: boolean
}

/**
 * A dialog for picking something: centered on wider screens and a sheet that
 * slides up from the bottom on phones. Closes with its close button or by
 * tapping outside.
 */
export function AdaptiveDialog({ open, onClose, title, children, tall = false, footer, dismissible = true, pageBackground = false }: Props) {
  const screens = Grid.useBreakpoint()

  if (screens.md) {
    return (
      <Modal
        open={open}
        onCancel={onClose}
        title={title}
        footer={footer ?? null}
        centered
        rootClassName={pageBackground ? 'page-background-sheet' : undefined}
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
      rootClassName={pageBackground ? 'page-background-sheet' : undefined}
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
