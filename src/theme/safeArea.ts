/**
 * Padding for the top of a page that starts at the very top of the screen,
 * `pixels` plus the space the device keeps free there (a notch or status bar
 * in the installed app; 0 on most screens). Needs `viewport-fit=cover`, which
 * `index.html` sets.
 */
export function belowStatusBar(pixels: number): string {
  return `calc(${pixels}px + env(safe-area-inset-top))`
}
