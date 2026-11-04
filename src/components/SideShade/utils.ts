import type { ColorScheme } from '../../hooks/useColorScheme'
import { GAP, SHADE_OPACITY } from './constants.ts'

/**
 * The background of the shade: a veil on each side of the centered column, with `GAP` px left clear
 * between the column and each veil, and nothing over the middle.
 */
export function shadeGradient(columnWidth: number, scheme: ColorScheme): string {
  const veil = `rgba(0, 0, 0, ${SHADE_OPACITY[scheme]})`
  const half = columnWidth / 2 + GAP
  return `linear-gradient(to right, ${veil} calc(50% - ${half}px), transparent calc(50% - ${half}px), transparent calc(50% + ${half}px), ${veil} calc(50% + ${half}px))`
}
