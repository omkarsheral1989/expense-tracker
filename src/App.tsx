import { Navigate, Route, Routes } from 'react-router'
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt'
import { RequireAuth } from './components/RequireAuth'
import { SignedInLayout } from './components/SignedInLayout'
import { useSyncSessionAcrossTabs } from './hooks/useSyncSessionAcrossTabs'
import { AddExpensePage } from './pages/addExpense'
import { CreateGroupPage } from './pages/createGroup'
import { EditExpensePage } from './pages/editExpense'
import { EditGroupPage } from './pages/editGroup'
import { ExpensePage } from './pages/expense'
import { GetStartedPage } from './pages/getStarted'
import { GroupPage } from './pages/group'
import { HomePage } from './pages/home'
import { SettleUpPage } from './pages/settleUp'
import { WelcomePage } from './pages/welcome'
import { ROUTES } from './routes.ts'

function App() {
  useSyncSessionAcrossTabs()

  return (
    <>
      <PwaUpdatePrompt />
      <Routes>
        <Route path={ROUTES.welcome} element={<WelcomePage />} />
        <Route path={ROUTES.getStarted} element={<GetStartedPage />} />
        {/* Everything inside needs a signed-in user or a guest, the header and open data. */}
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
          <Route path={ROUTES.editGroupPattern} element={<EditGroupPage />} />
          <Route path={ROUTES.settleUpPattern} element={<SettleUpPage />} />
          <Route path={ROUTES.newExpensePattern} element={<AddExpensePage />} />
          <Route path={ROUTES.expensePattern} element={<ExpensePage />} />
          <Route path={ROUTES.editExpensePattern} element={<EditExpensePage />} />
        </Route>
        <Route path="*" element={<Navigate to={ROUTES.welcome} replace />} />
      </Routes>
    </>
  )
}

export default App
