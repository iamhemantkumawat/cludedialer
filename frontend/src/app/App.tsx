import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { ToastViewport } from "../components/ToastViewport";
import { useDialer } from "./context";
import { LoginPage } from "../pages/LoginPage";
import { CampaignsPage } from "../pages/CampaignsPage";
import { IvrsPage } from "../pages/IvrsPage";
import { RunCampaignPage } from "../pages/RunCampaignPage";
import { HistoryPage } from "../pages/HistoryPage";
import { ContactListsPage } from "../pages/ContactListsPage";
import { AgentsPage } from "../pages/AgentsPage";
import { SipAccountsPage } from "../pages/SipAccountsPage";
import { ReportsPage } from "../pages/ReportsPage";
import { BrandLogo } from "../components/BrandLogo";

function ProtectedLayout() {
  const { authReady, isAuthenticated, user, amiConnected, logout, refreshBalance } = useDialer();

  if (!authReady) {
    return (
      <div className="boot-screen">
        <div className="boot-screen__card">
          <BrandLogo context="boot" subtitle="Loading your dialer workspace…" />
          <div className="boot-screen__copy">Loading your dialer workspace…</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <AppShell
      amiConnected={amiConnected}
      user={user}
      onLogout={() => {
        void logout();
      }}
      onRefreshBalance={() => {
        void refreshBalance();
      }}
    >
      <Outlet />
    </AppShell>
  );
}

export function App() {
  const { toasts, dismissToast, authReady, isAuthenticated } = useDialer();

  return (
    <>
      <Routes>
        <Route
          path="/login"
          element={
            !authReady ? (
              <div className="boot-screen">
                <div className="boot-screen__card">
                  <BrandLogo context="boot" subtitle="Restoring your Magnus session…" />
                  <div className="boot-screen__copy">Restoring your Magnus session…</div>
                </div>
              </div>
            ) : isAuthenticated ? (
              <Navigate to="/campaigns" replace />
            ) : (
              <LoginPage />
            )
          }
        />

        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<Navigate to="/campaigns" replace />} />
          <Route path="/campaigns" element={<CampaignsPage />} />
          <Route path="/ivrs" element={<IvrsPage />} />
          <Route path="/run" element={<RunCampaignPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/contacts" element={<ContactListsPage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/sip" element={<SipAccountsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
        </Route>
      </Routes>

      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
