import { Navigate } from 'react-router'
import { useAuthStore } from '../../stores/useAuthStore'
import { useInstallGate } from '../../hooks/useInstallGate'
import { ROUTES } from '../../routes.ts'
import { Faq } from './components/Faq'
import { Features } from './components/Features'
import { Footer } from './components/Footer'
import { Hero } from './components/Hero'
import { HowItWorks } from './components/HowItWorks'
import { InstallCard } from './components/InstallCard'
import { Privacy } from './components/Privacy'

export function WelcomePage() {
  // Getting started is locked behind installing the app: only on iPhone/iPad,
  // only while not installed, and only until the user chooses to skip (until
  // the page is reloaded). See `gated` on `InstallCard` for why.
  const { platform, installed, canPrompt, promptInstall, skipInstall, gated } = useInstallGate()

  const inApp = useAuthStore((state) => state.profile !== null || state.guest)

  // Signed-in users and guests go straight to the app.
  if (inApp) return <Navigate to={ROUTES.home} replace />

  // Nothing to install once the app is running as an installed app.
  function renderInstallCard() {
    if (installed) return null

    return (
      <InstallCard
        platform={platform}
        gated={gated}
        canPrompt={canPrompt}
        onInstall={promptInstall}
        onSkip={skipInstall}
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
