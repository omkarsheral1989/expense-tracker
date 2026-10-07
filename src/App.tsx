import { Navigate, Route, Routes } from 'react-router'
import { RequireAuth } from './auth/RequireAuth.tsx'
import { HomePage } from './pages/home/HomePage.tsx'
import { WelcomePage } from './pages/welcome/WelcomePage.tsx'
import { PwaUpdatePrompt } from './pwa/PwaUpdatePrompt.tsx'

function App() {
  return (
    <>
      <PwaUpdatePrompt />
      <Routes>
        <Route path="/" element={<WelcomePage />} />
        <Route
          path="/home"
          element={
            <RequireAuth>
              <HomePage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

export default App
