/**
 * Padding for the top of a page that starts at the very top of the screen,
 * `pixels` plus the space the device keeps free there (a notch or status bar
 * in the installed app; 0 on most screens). Needs `viewport-fit=cover`, which
 * `index.html` sets.
 */
export function belowStatusBar(pixels: number): string {
  return `calc(${pixels}px + env(safe-area-inset-top))`
}

/**
 * Padding for the bottom of a sheet that ends at the bottom of the screen,
 * `pixels` plus the space the device keeps free there (the home indicator and
 * the screen's rounded corners on an iPhone in the installed app; 0 on most
 * screens), so the sheet's last row and its buttons are not cut off. Needs
 * `viewport-fit=cover`, which `index.html` sets.
 */
export function aboveScreenEdge(pixels: number): string {
  return `calc(${pixels}px + env(safe-area-inset-bottom))`
}

/**
 * Space above the header row (Back button and title) of every page below the
 * device's status bar, so the header sits at the same height on all pages. The
 * colored bands of the group and expense pages use the same value.
 */
export const HEADER_TOP_PADDING = 16

/** The space under the last line of a colored band (the group page's and the expense page's): the same on both, and the same as its top (`HEADER_TOP_PADDING`) and its sides, 16 px. */
export const BAND_BOTTOM_PADDING = HEADER_TOP_PADDING

/** The space between a colored band and the content under it, on the group page and the expense page: the same 16 px as the band's own padding and the page's sides. */
export const UNDER_BAND_PADDING = HEADER_TOP_PADDING
