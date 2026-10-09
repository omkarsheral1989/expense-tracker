import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { GoogleOAuthProvider } from '@react-oauth/google'
import './index.css'
import App from './App.tsx'
import { GOOGLE_CLIENT_ID } from './config.ts'
import { ThemeProvider } from './components/ThemeProvider'
import { restoreRedirectedUrl } from './pwa/redirect.ts'

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
      {/* Without a client ID the provider (and Google's script) is skipped. */}
      {GOOGLE_CLIENT_ID ? (
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
          {app}
        </GoogleOAuthProvider>
      ) : (
        app
      )}
    </ThemeProvider>
  </StrictMode>,
)
