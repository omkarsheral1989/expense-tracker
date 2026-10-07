import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { GoogleOAuthProvider } from '@react-oauth/google'
import './index.css'
import App from './App.tsx'
import { GOOGLE_CLIENT_ID } from './config.ts'
import { ThemeProvider } from './components/ThemeProvider'

const app = (
  <BrowserRouter>
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
