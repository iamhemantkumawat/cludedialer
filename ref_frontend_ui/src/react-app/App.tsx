import { BrowserRouter as Router, Navigate, Route, Routes } from "react-router";
import DashboardLayout from "@/react-app/components/layout/DashboardLayout";
import Dashboard from "@/react-app/pages/Dashboard";
import Campaigns from "@/react-app/pages/Campaigns";
import RunCampaign from "@/react-app/pages/RunCampaign";
import CampaignHistory from "@/react-app/pages/CampaignHistory";
import Contacts from "@/react-app/pages/Contacts";
import LiveCalls from "@/react-app/pages/LiveCalls";
import Login from "@/react-app/pages/Login";
import { useAuth } from "@/react-app/context/AuthContext";
import Cdrs from "@/react-app/pages/Cdrs";
import CallerId from "@/react-app/pages/CallerId";
import Subscription from "@/react-app/pages/Subscription";
import Settings from "@/react-app/pages/Settings";
import Profile from "@/react-app/pages/Profile";
import Admin from "@/react-app/pages/Admin";
import PublicRun from "@/react-app/pages/PublicRun";

export default function App() {
  const { user, loading } = useAuth();
  const homePath = user ? (user.is_admin ? "/admin" : "/") : "/login";

  if (loading) {
    return (
      <div className="cx-loader-bg min-h-screen flex items-center justify-center px-6 relative overflow-hidden">
        <div className="cx-loader-orb cx-loader-orb-a" />
        <div className="cx-loader-orb cx-loader-orb-b" />

        <div className="cx-loader-card">
          <div className="cx-loader-ring-wrap">
            <div className="cx-loader-ring cx-loader-ring-primary" />
            <div className="cx-loader-ring cx-loader-ring-secondary" />
            <img
              src="/logo_custom1.png"
              alt="CyberX Calls"
              className="w-44 h-auto object-contain relative z-10"
            />
          </div>

          <div className="space-y-1">
            <p className="text-xl font-bold text-foreground">Loading CyberX Portal</p>
            <p className="text-sm text-muted-foreground">Syncing account, campaigns, and live dialer data</p>
          </div>

          <div className="cx-loader-progress" aria-hidden="true">
            <span />
          </div>

          <div className="cx-loader-dots" aria-label="Loading">
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/public/runs/:runUuid" element={<PublicRun />} />
        <Route path="/login" element={user ? <Navigate to={homePath} replace /> : <Login />} />
        <Route
          path="/portal/login"
          element={<Navigate to={user ? homePath : "/login"} replace />}
        />
        <Route
          path="/portal/*"
          element={<Navigate to={user ? homePath : "/login"} replace />}
        />
        <Route
          element={
            user ? (
              <DashboardLayout />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        >
          {user?.is_admin ? (
            <>
              <Route path="/" element={<Navigate to="/admin" replace />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/admin/users" element={<Admin />} />
              <Route path="/admin/live" element={<Admin />} />
              <Route path="/admin/campaigns" element={<Admin />} />
              <Route path="/admin/cdrs" element={<Admin />} />
              <Route path="/admin/activity" element={<Admin />} />
              <Route path="/admin/broadcast" element={<Admin />} />
              <Route path="/admin/security" element={<Admin />} />
            </>
          ) : (
            <>
              <Route path="/" element={<Dashboard />} />
              <Route path="/campaigns" element={<Campaigns />} />
              <Route path="/campaigns/history" element={<CampaignHistory />} />
              <Route path="/campaigns/run" element={<RunCampaign />} />
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/live-calls" element={<LiveCalls />} />
              <Route path="/cdrs" element={<Cdrs />} />
              <Route path="/caller-id" element={<CallerId />} />
              <Route path="/subscription" element={<Subscription />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/profile" element={<Profile />} />
            </>
          )}
        </Route>
        <Route path="*" element={<Navigate to={user ? homePath : "/login"} replace />} />
      </Routes>
    </Router>
  );
}
