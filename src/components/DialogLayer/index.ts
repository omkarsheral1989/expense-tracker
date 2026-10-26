/** The element the layer is, kept once made. */
let layer: HTMLElement | null = null

/**
 * The container that confirmations which start a page change ("Discard this group?", "Delete this expense?") open in, as their
 * `getContainer`. It stays on the page once made, like Ant Design's message list, so it can be its own picture during a page
 * transition (`app-dialog` in `index.css`), above the sliding pages: there the dialog plays its own closing over the page change,
 * instead of being part of the still background under the pages. A dialog's own wrapper cannot be that picture: it is made when
 * the dialog opens and removed once it has closed, and the browser ends a transition when a named piece leaves the page.
 */
export function dialogLayer(): HTMLElement {
  if (!layer || !layer.isConnected) {
    layer = document.createElement('div')
    layer.dataset.dialogLayer = ''
    document.body.appendChild(layer)
  }
  return layer
}
