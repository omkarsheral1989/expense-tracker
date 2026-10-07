import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // PGlite loads its WebAssembly and data files relative to its own module, so
  // Vite must not pre-bundle it.
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    VitePWA({
      // Ask the user before swapping in a new version (see PwaUpdatePrompt).
      registerType: 'prompt',
      pwaAssets: { config: true },
      manifest: {
        name: 'OwnLedger',
        short_name: 'OwnLedger',
        description:
          'Split expenses with friends and keep your data. Offline first, free and open source.',
        theme_color: '#0d9488',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
      },
      workbox: {
        // PGlite's WebAssembly (about 10 MB) and data (about 6 MB) files must be
        // cached for the app to open its database offline, so the default 2 MB
        // limit per file is raised.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,wasm,data,webmanifest}'],
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
