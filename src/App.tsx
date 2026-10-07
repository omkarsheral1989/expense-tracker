import { Navigate, Outlet, Route, Routes } from 'react-router'
import { RequireAuth } from './auth/RequireAuth.tsx'
import { DatabaseGate } from './components/DatabaseGate'
import { HomePage } from './pages/home'
import { WelcomePage } from './pages/welcome'
import { PwaUpdatePrompt } from './pwa/PwaUpdatePrompt.tsx'

function App() {
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
