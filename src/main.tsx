import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { GoogleOAuthProvider } from '@react-oauth/google'
import '@fontsource/barlow-condensed/100.css'
import './index.css'
import App from './App.tsx'
import { GOOGLE_CLIENT_ID } from './config.ts'
import { QueryProvider } from './components/QueryProvider'
import { ThemeProvider } from './components/ThemeProvider'
import { restoreRedirectedUrl } from './pwa/redirect.ts'
import { logService } from './services/logService'

const log = logService.scope('app')
logService.watchGlobalErrors(window)
log.info('App started', {
  mode: import.meta.env.MODE,
  online: navigator.onLine,
  standalone: window.matchMedia('(display-mode: standalone)').matches,
})
window.addEventListener('online', () => log.info('Connection back'))
window.addEventListener('offline', () => log.warn('Connection lost'))

// GitHub Pages sends unknown addresses to 404.html, which bounces them here.
restoreRedirectedUrl(window.location, window.history)

const app = (
  <BrowserRouter basename={import.meta.env.BASE_URL}>
    <App />
  </BrowserRouter>
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryProvider>
        {/* Without a client ID the provider (and Google's script) is skipped. */}
        {GOOGLE_CLIENT_ID ? (
          <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
            {app}
          </GoogleOAuthProvider>
        ) : (
          app
        )}
      </QueryProvider>
    </ThemeProvider>
  </StrictMode>,
)
