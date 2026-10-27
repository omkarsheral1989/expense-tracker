import { App } from 'antd'
import type { ModalFuncProps } from 'antd'
import { useCallback } from 'react'
import { openOverlay, releaseOverlay } from '../useCloseOnBack/overlays.ts'

/**
 * `modal.confirm` whose dialog the browser's Back button closes, as Cancel does (PRD 5.19, ADR-063). Returns the function to open it
 * with. The dialog holds a step of the history while it is open, which is removed when it closes (or dropped with a page change).
 */
export function useConfirm() {
  const { modal } = App.useApp()

  return useCallback(
    (config: ModalFuncProps) => {
      const overlay = openOverlay({
        // Back is the Cancel button.
        close: () => {
          config.onCancel?.()
          instance.destroy()
        },
        dismissible: () => true,
      })
      const instance = modal.confirm({
        ...config,
        afterClose: () => {
          releaseOverlay(overlay)
          config.afterClose?.()
        },
      })
      return instance
    },
    [modal],
  )
}
