import { useState } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '../../auth/authStore.ts'
import { REQUIRE_INSTALL } from '../../config.ts'
import { useInstall } from '../../pwa/useInstall.ts'
import { Faq } from './Faq.tsx'
import { Features } from './Features.tsx'
import { Footer } from './Footer.tsx'
import { Hero } from './Hero.tsx'
import { HowItWorks } from './HowItWorks.tsx'
import { InstallCard } from './InstallCard.tsx'
import { Privacy } from './Privacy.tsx'

export function WelcomePage() {
  const { platform, installed, canPrompt, promptInstall } = useInstall()
  // Only lasts until the page is reloaded; the choice is not remembered.
  const [skipped, setSkipped] = useState(false)

  const signedIn = useAuth((state) => state.profile !== null)

  const gated = REQUIRE_INSTALL && platform === 'ios' && !installed && !skipped

  // Signed-in users go straight to the app.
  if (signedIn) return <Navigate to="/home" replace />

  return (
    <main>
      <Hero gated={gated} />
      {!installed && (
        <InstallCard
          platform={platform}
          gated={gated}
          canPrompt={canPrompt}
          onInstall={promptInstall}
          onSkip={() => setSkipped(true)}
        />
      )}
      <Features />
      <Privacy />
      <HowItWorks />
      <Faq />
      <Footer />
    </main>
  )
}
