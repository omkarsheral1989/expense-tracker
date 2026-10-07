import { useState } from 'react'
import { Navigate } from 'react-router'
import { useAuthStore } from '../../stores/useAuthStore'
import { REQUIRE_INSTALL } from '../../config.ts'
import { useInstall } from '../../hooks/useInstall'
import { Faq } from './components/Faq'
import { Features } from './components/Features'
import { Footer } from './components/Footer'
import { Hero } from './components/Hero'
import { HowItWorks } from './components/HowItWorks'
import { InstallCard } from './components/InstallCard'
import { Privacy } from './components/Privacy'

export function WelcomePage() {
  const { platform, installed, canPrompt, promptInstall } = useInstall()
  // Only lasts until the page is reloaded; the choice is not remembered.
  const [skipped, setSkipped] = useState(false)

  const signedIn = useAuthStore((state) => state.profile !== null)

  // Signing in is locked behind installing the app: only on iPhone/iPad, only
  // while not installed, and only until the user chooses to skip. See `gated`
  // on `InstallCard` for why.
  const gated = REQUIRE_INSTALL && platform === 'ios' && !installed && !skipped

  // Signed-in users go straight to the app.
  if (signedIn) return <Navigate to="/home" replace />

  // Nothing to install once the app is running as an installed app.
  function renderInstallCard() {
    if (installed) return null

    return (
      <InstallCard
        platform={platform}
        gated={gated}
        canPrompt={canPrompt}
        onInstall={promptInstall}
        onSkip={() => setSkipped(true)}
      />
    )
  }

  return (
    <main>
      <Hero gated={gated} installCard={renderInstallCard()} />
      <Features />
      <Privacy />
      <HowItWorks />
      <Faq />
      <Footer />
    </main>
  )
}
