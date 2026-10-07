import { Navigate, Outlet, Route, Routes } from 'react-router'
import { RequireAuth } from './components/RequireAuth'
import { DatabaseGate } from './components/DatabaseGate'
import { HomePage } from './pages/home'
import { WelcomePage } from './pages/welcome'
import { useSyncSessionAcrossTabs } from './hooks/useSyncSessionAcrossTabs'
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt'

function App() {
  useSyncSessionAcrossTabs()

  return (
    <>
      <PwaUpdatePrompt />
      <Routes>
        <Route path="/" element={<WelcomePage />} />
        {/* Everything inside needs a signed-in user and an open database. */}
        <Route
          element={
            <RequireAuth>
              <DatabaseGate>
                <Outlet />
              </DatabaseGate>
            </RequireAuth>
          }
        >
          <Route path="/home" element={<HomePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

export default App
