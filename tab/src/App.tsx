/**
 * Raksha Tab — App Root
 *
 * Single tab with internal navigation:
 * - Home (landing page for everyone — trust, education, quick actions)
 * - My Cases (employee's own complaints)
 * - Know Your Rights (POSH Act education)
 * - ICC Dashboard (ICC members only — auto-detected via API)
 *
 * Role is determined by the API (iccConfig membership check),
 * NOT by the URL. Employees never see ICC UI.
 */

import { FluentProvider, teamsDarkTheme, teamsLightTheme } from "@fluentui/react-components";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { useTeams } from "./hooks/useTeams";
import { useAuth } from "./hooks/useAuth";
import { AuthProvider } from "./context/AuthContext";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { EmployeeDashboard } from "./pages/EmployeeDashboard";
import { KnowYourRights } from "./pages/KnowYourRights";
import { ComplaintDetail } from "./pages/ComplaintDetail";
import { IccDashboard } from "./pages/IccDashboard";
import { IccCaseView } from "./pages/IccCaseView";
import { Loading } from "./components/Loading";

export function App() {
  const teams = useTeams();

  if (teams.error) {
    return (
      <FluentProvider theme={teamsLightTheme} className="p-6">
        <div>Failed to initialize Teams SDK: {teams.error}</div>
      </FluentProvider>
    );
  }

  if (!teams.initialized) {
    return (
      <FluentProvider theme={teamsLightTheme} className="p-6">
        <Loading message="Initializing..." />
      </FluentProvider>
    );
  }

  const fluentTheme = teams.theme === "dark" ? teamsDarkTheme : teamsLightTheme;

  return (
    <FluentProvider theme={fluentTheme} className="min-h-screen">
      <HashRouter>
        <AppRoutes teams={teams} />
      </HashRouter>
    </FluentProvider>
  );
}

function AppRoutes({ teams }: { teams: import("./hooks/useTeams").TeamsState }) {
  const auth = useAuth(teams);

  if (auth.loading) return <Loading message="Checking your access..." />;

  const isIcc = auth.user?.role === "icc";

  return (
    <AuthProvider user={auth.user} loading={auth.loading} error={auth.error}>
      <Layout>
        <Routes>
          {/* Home — landing page for all users */}
          <Route path="/" element={<Home />} />

          {/* My Cases — employee's complaints */}
          <Route path="/cases" element={<EmployeeDashboard />} />

          {/* Know Your Rights — POSH Act education */}
          <Route path="/rights" element={<KnowYourRights />} />

          {/* Complaint detail — accessible by both roles */}
          <Route path="/complaint/:complaintId" element={<ComplaintDetail />} />

          {/* ICC-only routes */}
          <Route
            path="/icc"
            element={isIcc ? <IccDashboard /> : <Navigate to="/" replace />}
          />
          <Route
            path="/icc/case/:complaintId"
            element={isIcc ? <IccCaseView /> : <Navigate to="/" replace />}
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </AuthProvider>
  );
}
