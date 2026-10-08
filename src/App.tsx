import { Navigate, Route, Routes } from 'react-router'
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt'
import { RequireAuth } from './components/RequireAuth'
import { SignedInLayout } from './components/SignedInLayout'
import { useSyncSessionAcrossTabs } from './hooks/useSyncSessionAcrossTabs'
import { AddExpensePage } from './pages/addExpense'
import { CreateGroupPage } from './pages/createGroup'
import { GroupPage } from './pages/group'
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
          <Route path={ROUTES.groupPattern} element={<GroupPage />} />
          <Route path={ROUTES.newExpensePattern} element={<AddExpensePage />} />
        </Route>
        <Route path="*" element={<Navigate to={ROUTES.welcome} replace />} />
      </Routes>
    </>
  )
}

export default App
