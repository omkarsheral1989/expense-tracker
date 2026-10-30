import { Navigate, Route, Routes } from 'react-router'
import { PageTransitions } from './components/PageTransitions'
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt'
import { RequireAuth } from './components/RequireAuth'
import { SignedInLayout } from './components/SignedInLayout'
import { sharedFiles } from './pwa/sharedFiles.ts'
import { useSyncSessionAcrossTabs } from './hooks/useSyncSessionAcrossTabs'
import { AddExpensePage } from './pages/addExpense'
import { CreateGroupPage } from './pages/createGroup'
import { EditExpensePage } from './pages/editExpense'
import { EditGroupPage } from './pages/editGroup'
import { ExpensePage } from './pages/expense'
import { ExpenseVersionPage } from './pages/expenseVersion'
import { GetStartedPage } from './pages/getStarted'
import { GroupPage } from './pages/group'
import { HomePage } from './pages/home'
import { AccountsPage } from './pages/accounts'
import { ActivityPage } from './pages/activity'
import { MembersPage } from './pages/members'
import { SharePage } from './pages/share'
import { ShareTestPage } from './pages/shareTest'
import { SettleUpPage } from './pages/settleUp'
import { BalancesPage } from './pages/balances'
import { DeletedGroupsPage } from './pages/deletedGroups'
import { TotalsPage } from './pages/totals'
import { WelcomePage } from './pages/welcome'
import { ROUTES } from './routes.ts'

/** A visitor turned away must not leave a shared picture behind (PRD 5.11). */
function dropSharedFiles() {
  void sharedFiles.clear().catch(() => {})
}

function App() {
  useSyncSessionAcrossTabs()

  return (
    <>
      <PwaUpdatePrompt />
      <PageTransitions />
      <Routes>
        <Route path={ROUTES.welcome} element={<WelcomePage />} />
        <Route path={ROUTES.getStarted} element={<GetStartedPage />} />
        {/* Everything inside needs a signed-in user or a guest, the header and open data. */}
        <Route
          element={
            <RequireAuth onDenied={dropSharedFiles}>
              <SignedInLayout />
            </RequireAuth>
          }
        >
          <Route path={ROUTES.home} element={<HomePage />} />
          <Route path={ROUTES.members} element={<MembersPage />} />
          <Route path={ROUTES.activity} element={<ActivityPage />} />
          <Route path={ROUTES.accounts} element={<AccountsPage />} />
          <Route path={ROUTES.deletedGroups} element={<DeletedGroupsPage />} />
          <Route path={ROUTES.newGroup} element={<CreateGroupPage />} />
          <Route path={ROUTES.share} element={<SharePage />} />
          <Route path={ROUTES.groupPattern} element={<GroupPage />} />
          <Route path={ROUTES.editGroupPattern} element={<EditGroupPage />} />
          <Route path={ROUTES.settleUpPattern} element={<SettleUpPage />} />
          <Route path={ROUTES.balancesPattern} element={<BalancesPage />} />
          <Route path={ROUTES.totalsPattern} element={<TotalsPage />} />
          <Route path={ROUTES.newExpensePattern} element={<AddExpensePage />} />
          <Route path={ROUTES.expensePattern} element={<ExpensePage />} />
          <Route path={ROUTES.editExpensePattern} element={<EditExpensePage />} />
          <Route path={ROUTES.expenseVersionPattern} element={<ExpenseVersionPage />} />
        </Route>
        {import.meta.env.DEV && <Route path={ROUTES.shareTest} element={<ShareTestPage />} />}
        <Route path="*" element={<Navigate to={ROUTES.welcome} replace />} />
      </Routes>
    </>
  )
}

export default App
