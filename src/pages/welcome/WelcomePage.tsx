import { useState } from 'react'
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

  const gated = REQUIRE_INSTALL && platform === 'ios' && !installed && !skipped

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
