/** How long a page slides in or out, in ms (PRD 5.15). The CSS reads it as `--page-transition-ms`. */
export const PAGE_TRANSITION_MS = 600

/** How long the fade lasts for a page that arrives without a slide (no View Transitions, a replaced page, the browser's Back), in ms. */
export const PAGE_FADE_MS = 200

/** How long a group's row morphs into its page, and back, in ms (PRD 5.16). The CSS reads it as `--group-open-ms`. */
export const GROUP_OPEN_MS = 600

/**
 * What the rest of the screen does while a group's row morphs into its page (PRD 5.16): `fade` cross-fades
 * the two pages under the pieces that travel; `slide` moves them as in 5.15: opening, the list moves left and fades
 * while the group's page comes in from the right (closing is the mirror). The CSS reads it as `data-group-rest` on the
 * page's root, so a further style is one more value here and its rules in `src/index.css`.
 */
export type GroupOpenRest = 'fade' | 'slide'
export const GROUP_OPEN_REST: GroupOpenRest = 'slide'
