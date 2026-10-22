import type { CSSProperties } from 'react'

/**
 * The title in the header of a page that has a Back button ("Expense", "Edit
 * group", "Settle up"): a heading, but quiet next to the content's own title. Set in
 * Barlow Condensed Thin (self-hosted).
 */
export const HEADER_TITLE_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: "'Barlow Condensed', sans-serif",
  fontSize: 32,
  lineHeight: '40px',
  fontWeight: 100,
  textTransform: 'uppercase',
}
