import { Navigate } from 'react-router'
import { useAuthStore } from '../../stores/useAuthStore'
import { useInstallGate } from '../../hooks/useInstallGate'
import { ROUTES } from '../../routes.ts'
import { AppInfo } from '../../components/AppInfo'
import { InstallCard } from './components/InstallCard'
import { StartActions } from './components/StartActions'

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
    <AppInfo>
      <StartActions gated={gated} installCard={renderInstallCard()} />
    </AppInfo>
  )
}
