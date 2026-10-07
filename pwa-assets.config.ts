import {
  defineConfig,
  minimal2023Preset,
} from '@vite-pwa/assets-generator/config'

// Generates the PWA icons (192, 512, maskable, Apple touch icon, favicon.ico)
// from a single full-bleed source image. The source already keeps its artwork
// inside the maskable safe zone, so the maskable and Apple icons need no
// extra padding.
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0 },
    apple: { ...minimal2023Preset.apple, padding: 0 },
  },
  images: ['public/logo.svg'],
})
