/**
 * The band's background for a group's color: a diagonal gradient from the color
 * to a darker shade of it, with two faint light circles on top for a subtle
 * pattern. All CSS, so there are no image files.
 */
export function bandBackground(color: string): string {
  return [
    'radial-gradient(circle at 12% 18%, rgba(255,255,255,0.14) 0 70px, transparent 71px)',
    'radial-gradient(circle at 88% 78%, rgba(255,255,255,0.10) 0 120px, transparent 121px)',
    `linear-gradient(160deg, ${color}, color-mix(in srgb, ${color} 68%, black))`,
  ].join(', ')
}
