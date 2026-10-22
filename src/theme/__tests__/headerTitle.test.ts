import { describe, expect, it } from 'vitest'
import { HEADER_TITLE_STYLE } from '../headerTitle.ts'

describe('HEADER_TITLE_STYLE', () => {
  it('is Barlow Condensed Thin, 32 px on a 40 px line, in capitals', () => {
    expect(HEADER_TITLE_STYLE).toEqual({
      margin: 0,
      fontFamily: "'Barlow Condensed', sans-serif",
      fontSize: 32,
      lineHeight: '40px',
      fontWeight: 100,
      textTransform: 'uppercase',
    })
  })
})
