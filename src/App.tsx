import { Navigate, Route, Routes } from 'react-router'
import { WelcomePage } from './pages/welcome/WelcomePage.tsx'
import { PwaUpdatePrompt } from './pwa/PwaUpdatePrompt.tsx'

function App() {
  return (
    <>
      <PwaUpdatePrompt />
      <Routes>
        <Route path="/" element={<WelcomePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

export default App
