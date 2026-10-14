/** How far the floating button sits from the bottom of the screen. */
export const FLOATING_BUTTON_BOTTOM = 24

/** The height of the floating button: taller than the 40 px of every other control. */
export const FLOATING_BUTTON_HEIGHT = 48

/** The space kept free between the top of the floating button and what is above it. */
export const FLOATING_BUTTON_GAP = 16

/**
 * The space from the bottom of the screen up to `FLOATING_BUTTON_GAP` above the
 * floating button (24 + 48 + 16 = 88 px). An empty message ends here, so it is
 * centered in the space above the button, not behind or under it.
 */
export const ABOVE_FLOATING_BUTTON = FLOATING_BUTTON_BOTTOM + FLOATING_BUTTON_HEIGHT + FLOATING_BUTTON_GAP

/** Space a page leaves below a list, so its last row is not hidden behind the floating button. */
export const FLOATING_BUTTON_ROOM = 112
