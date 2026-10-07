import { useState } from 'react'
import { App } from 'antd'
import { useGoogleLogin } from '@react-oauth/google'
import { useAuth } from './authStore.ts'
import { fetchProfile } from './googleProfile.ts'

// Basic sign-in only. Drive access is requested later, when it is first needed.
const SIGN_IN_SCOPE = 'openid email profile'

function googleScriptLoaded() {
  const google = (window as unknown as { google?: { accounts?: unknown } }).google
  return Boolean(google?.accounts)
}

export function useSignIn() {
  const { message } = App.useApp()
  const signInToStore = useAuth((state) => state.signIn)
  const [loading, setLoading] = useState(false)

  const login = useGoogleLogin({
    flow: 'implicit',
    scope: SIGN_IN_SCOPE,
    onSuccess: async (response) => {
      try {
        const profile = await fetchProfile(response.access_token)
        signInToStore(profile, {
          value: response.access_token,
          expiresAt: Date.now() + response.expires_in * 1000,
        })
      } catch {
        message.error("Couldn't read your Google profile. Please try again.")
      } finally {
        setLoading(false)
      }
    },
    onError: () => {
      setLoading(false)
      message.error(
        "Google didn't allow the sign-in. If you saw \"Access blocked\", see the questions below.",
      )
    },
    onNonOAuthError: (error) => {
      setLoading(false)
      // Closing the window is the user's choice, not an error.
      if (error.type === 'popup_failed_to_open') {
        message.error('The sign-in window was blocked. Allow pop-ups and try again.')
      }
    },
  })

  function signIn() {
    if (!navigator.onLine || !googleScriptLoaded()) {
      message.warning('Sign-in needs an internet connection. Check it and try again.')
      return
    }
    setLoading(true)
    login()
  }

  return { signIn, loading }
}
