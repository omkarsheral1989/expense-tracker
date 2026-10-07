import { Navigate, Route, Routes } from 'react-router'
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt'
import { RequireAuth } from './components/RequireAuth'
import { SignedInLayout } from './components/SignedInLayout'
import { useSyncSessionAcrossTabs } from './hooks/useSyncSessionAcrossTabs'
import { CreateGroupPage } from './pages/createGroup'
import { HomePage } from './pages/home'
import { WelcomePage } from './pages/welcome'
import { ROUTES } from './routes.ts'

function App() {
  useSyncSessionAcrossTabs()

  return (
    <>
      <PwaUpdatePrompt />
      <Routes>
        <Route path={ROUTES.welcome} element={<WelcomePage />} />
        {/* Everything inside needs a signed-in user, the header and open data. */}
        <Route
          element={
            <RequireAuth>
              <SignedInLayout />
            </RequireAuth>
          }
        >
          <Route path={ROUTES.home} element={<HomePage />} />
          <Route path={ROUTES.newGroup} element={<CreateGroupPage />} />
        </Route>
        <Route path="*" element={<Navigate to={ROUTES.welcome} replace />} />
      </Routes>
    </>
  )
}

export default App
