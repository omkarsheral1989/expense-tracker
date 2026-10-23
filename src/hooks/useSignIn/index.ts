import { useState } from 'react'
import { App } from 'antd'
import { useGoogleLogin } from '@react-oauth/google'
import { useAuthStore } from '../../stores/useAuthStore'
import { deviceService } from '../../services/deviceService'
import { googleProfileService } from '../../services/googleProfileService'
import { logService } from '../../services/logService'

const log = logService.scope('auth')

// Basic sign-in only. Drive access is requested later, when it is first needed.
const SIGN_IN_SCOPE = 'openid email profile'

function googleScriptLoaded() {
  const google = (window as unknown as { google?: { accounts?: unknown } }).google
  return Boolean(google?.accounts)
}

export function useSignIn() {
  const { message, modal } = App.useApp()
  const signInToStore = useAuthStore((state) => state.signIn)
  const [loading, setLoading] = useState(false)

  const login = useGoogleLogin({
    flow: 'implicit',
    scope: SIGN_IN_SCOPE,
    onSuccess: async (response) => {
      try {
        const profile = await googleProfileService.fetchProfile(response.access_token)
        // The data on this device belongs to one Google account (ADR-035).
        const device = deviceService.forGoogle(profile)
        if (!device.ok) {
          log.warn('Sign-in refused, the device belongs to another account')
          modal.error({
            title: 'This device is already used by another account',
            content: `This device's data belongs to ${device.ownerEmail}. Sign in with that account, or clear the app's data to use another.`,
          })
          return
        }
        signInToStore(profile, {
          value: response.access_token,
          expiresAt: Date.now() + response.expires_in * 1000,
        })
      } catch (error) {
        log.error('Could not read the Google profile', logService.errorFields(error))
        message.error("Couldn't read your Google profile. Please try again.")
      } finally {
        setLoading(false)
      }
    },
    onError: (error) => {
      log.warn('Google refused the sign-in', { type: error?.error })
      setLoading(false)
      message.error(
        "Google didn't allow the sign-in. If you saw \"Access blocked\", see the questions below.",
      )
    },
    onNonOAuthError: (error) => {
      setLoading(false)
      log.info('Google window closed or blocked', { type: error.type })
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
