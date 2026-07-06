import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useStore } from './store.js';
import { BottomNav } from './ui.js';
import { Loading } from './screens/Loading.js';
import { Login } from './screens/Login.js';
import { OtpVerify } from './screens/OtpVerify.js';
import { Onboarding } from './screens/Onboarding.js';
import { Home } from './screens/Home.js';
import { GroupsList } from './screens/GroupsList.js';
import { GroupDetail } from './screens/GroupDetail.js';
import { CreateGroup } from './screens/CreateGroup.js';
import { GroupSettings } from './screens/GroupSettings.js';
import { GroupSummary } from './screens/GroupSummary.js';
import { GroupExpenses } from './screens/GroupExpenses.js';
import { AddMember } from './screens/AddMember.js';
import { Friends } from './screens/Friends.js';
import { ActivityFeed } from './screens/ActivityFeed.js';
import { Profile } from './screens/Profile.js';
import { EditProfile } from './screens/EditProfile.js';
import { UpiAppSettings } from './screens/UpiApp.js';
import { ExpenseDetail } from './screens/ExpenseDetail.js';
import { EditExpense } from './screens/EditExpense.js';
import { SettleUp } from './screens/SettleUp.js';
import { AddExpense } from './AddExpense.js';

const TAB_PATHS = ['/', '/groups', '/activity', '/profile'];
const PUBLIC_PATHS = ['/login', '/otp'];

export function App() {
  const { auth } = useStore();
  const loc = useLocation();

  if (auth === 'loading') return <Shell><Loading /></Shell>;

  // Anonymous: only the login/OTP screens.
  if (auth === 'anon') {
    return (
      <Shell>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/otp" element={<OtpVerify />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Shell>
    );
  }

  // Logged in but profile incomplete: force onboarding.
  if (auth === 'onboarding') {
    return (
      <Shell>
        <Routes>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="*" element={<Navigate to="/onboarding" replace />} />
        </Routes>
      </Shell>
    );
  }

  // Ready: full app. Bounce away from auth-only screens.
  if (PUBLIC_PATHS.includes(loc.pathname) || loc.pathname === '/onboarding') {
    return <Navigate to="/" replace />;
  }

  const showNav = TAB_PATHS.includes(loc.pathname);

  return (
    <Shell routeKey={loc.pathname}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/groups" element={<GroupsList />} />
        <Route path="/groups/new" element={<CreateGroup />} />
        <Route path="/groups/:id" element={<GroupDetail />} />
        <Route path="/groups/:id/settings" element={<GroupSettings />} />
        <Route path="/groups/:id/summary" element={<GroupSummary />} />
        <Route path="/groups/:id/expenses" element={<GroupExpenses />} />
        <Route path="/groups/:id/add-member" element={<AddMember />} />
        <Route path="/groups/:id/add" element={<AddExpense />} />
        <Route path="/friends" element={<Friends />} />
        <Route path="/activity" element={<ActivityFeed />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/profile/edit" element={<EditProfile />} />
        <Route path="/profile/upi-app" element={<UpiAppSettings />} />
        <Route path="/expense/:id" element={<ExpenseDetail />} />
        <Route path="/expense/:id/edit" element={<EditExpense />} />
        <Route path="/settle/:groupId/:toUserId" element={<SettleUp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {showNav && <BottomNav />}
    </Shell>
  );
}

function Shell({ children, routeKey }: { children: React.ReactNode; routeKey?: string }) {
  // Keyed by route so every screen change replays a quick fade. Opacity-only:
  // a transform here would break the fixed bottom nav / FAB / sheets.
  return (
    <div className="max-w-[28rem] mx-auto min-h-screen bg-paper relative">
      <div key={routeKey} className={routeKey ? 'route-fade' : undefined}>{children}</div>
    </div>
  );
}
