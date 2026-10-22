/**
 * The height of every control: buttons of any size and type, text inputs,
 * dropdowns and date pickers. Ant Design has three sizes (24, 32 and 40 px by
 * default); all three are 40 px here, so a page never sets a height. The only
 * exceptions are the floating buttons (48 px, see `FloatingPillButton`) and a
 * few small things that sit on top of something else (the remove badge on a
 * receipt photo).
 */
export const CONTROL_HEIGHT = 40

/**
 * The size of the icon inside a button, in px: icon-only buttons (Back, Delete, Sync, the band's round
 * buttons) through the theme, and buttons with text beside the icon (Edit, Restore, Add member) through
 * `index.css`, which repeats this number. The button stays `CONTROL_HEIGHT`.
 */
export const ICON_ONLY_SIZE = 18
