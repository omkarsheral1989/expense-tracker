// The style rules that jsdom does not apply: this only checks that they are written, so a refactor cannot drop one unnoticed. How they look
// is checked in the browser (and on a phone).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8')

/** The declaration block of the first rule whose selector contains `selector`. */
function rule(selector: string): string {
  const start = css.indexOf(selector)
  if (start < 0) throw new Error(`No rule for ${selector}`)
  return css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
}

describe('the browser\'s blue tap highlight', () => {
  it('is off for the whole page, so a tap shows only the app\'s own pressed state', () => {
    expect(rule('\nbody {')).toContain('-webkit-tap-highlight-color: transparent')
  })
})

describe('.tap-feedback (hover and pressed wash of a tappable row or card)', () => {
  it('is an overlay in the primary color with the row\'s own corners, off until hovered or pressed', () => {
    expect(rule('.tap-feedback {')).toContain('position: relative')
    const overlay = rule('.tap-feedback::after')
    expect(overlay).toContain('border-radius: inherit')
    expect(overlay).toContain('var(--ant-color-primary)')
    expect(overlay).toContain('opacity: 0')
    expect(overlay).toContain('pointer-events: none')
  })

  it('is faint under a mouse, only where hovering is real, and stronger while pressed', () => {
    expect(css).toMatch(/@media \(hover: hover\) \{\s*\.tap-feedback:hover::after \{\s*opacity: 0\.06/)
    expect(rule('.tap-feedback:active::after')).toContain('opacity: 0.12')
  })
})

describe('the corners of a morphing band', () => {
  it('are a clip-path on the picture pair, not an overflow clip and a border radius, which iOS Safari did not apply', () => {
    const open = rule("html[data-nav='hero-open']::view-transition-image-pair(group-band) {\n  animation-name")
    expect(open).toContain('clip-path: inset(0 round var(--hero-block-radius')
    expect(open).not.toContain('border-radius')
    expect(css).toMatch(/@keyframes group-band-straighten \{[^}]*clip-path[^}]*\}[^}]*clip-path: inset\(0 round 0\)/)
    expect(css).toMatch(/@keyframes group-band-round \{[^}]*clip-path: inset\(0 round 0\)/)
    expect(rule("html[data-nav='hero-open']::view-transition-image-pair(group-band),")).not.toContain('overflow')
  })
})

describe('the photo viewer\'s fade', () => {
  it('keeps the viewer itself fully opaque, so the mask\'s blur sees the page while it fades in and out', () => {
    expect(rule('.ant-image-preview {')).toContain('opacity: 1 !important')
  })

  it('fades the blur and the dim of the mask, and the photo and buttons, instead', () => {
    expect(rule('.ant-image-preview-mask {')).toContain('transition:')
    expect(css).toMatch(/\.ant-image-preview-fade-leave-active \.ant-image-preview-mask \{\s*backdrop-filter: blur\(0\) !important/)
    expect(css).toMatch(/\.ant-image-preview-fade-enter-active \.ant-image-preview-mask,[^{]*\{\s*backdrop-filter: blur\(4px\) !important/)
  })

  it('still ends its motion: the viewer transitions an invisible outline color, since a child\'s transition does not end it', () => {
    expect(rule('.ant-image-preview {')).toContain('transition: outline-color')
    expect(css).toMatch(/\.ant-image-preview-fade-leave-active \{\s*outline-color: transparent/)
  })
})
