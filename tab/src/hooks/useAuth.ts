/**
 * Raksha Tab — Auth Context Hook
 *
 * Determines the user's role (employee vs ICC) by calling the API.
 * Receives user identity from the TeamsState provided by useTeams —
 * does NOT call teamsApp.getContext() independently (that can hang).
 *
 * TODO: Implement full SSO with Entra ID token acquisition for API calls.
 */

import { useState, useEffect } from "react";
import { getUserRole } from "../services/apiClient";
import type { TeamsState } from "./useTeams";

export interface AuthUser {
  userId: string;
  tenantId: string;
  displayName: string;
  role: "employee" | "icc";
  iccRole: string | null; // presiding_officer, member, external_member
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
}

/**
 * @param teams — The resolved TeamsState from useTeams(). Must be initialized.
 */
export function useAuth(teams: TeamsState): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!teams.initialized) return;

    let cancelled = false;

    async function resolve() {
      // Get identity: from Teams context if available, else dev defaults
      let userId: string;
      let tenantId: string;
      let displayName: string;

      if (teams.inTeams && teams.userId && teams.tenantId) {
        userId = teams.userId;
        tenantId = teams.tenantId;
        displayName = teams.displayName ?? "User";
      } else {
        const params = new URLSearchParams(window.location.search);
        userId = params.get("userId") ?? "dev-user";
        tenantId = params.get("tenantId") ?? "dev-tenant";
        displayName = "Dev User";
      }

      try {
        // Call the API to determine role from iccConfig
        const roleInfo = await getUserRole(tenantId, userId);
        if (cancelled) return;

        setState({
          user: {
            userId,
            tenantId,
            displayName,
            role: roleInfo.role,
            iccRole: roleInfo.iccRole,
          },
          loading: false,
          error: null,
        });
      } catch {
        // If role check fails, default to employee (safest — no ICC access)
        if (cancelled) return;
        setState({
          user: {
            userId,
            tenantId,
            displayName,
            role: "employee",
            iccRole: null,
          },
          loading: false,
          error: null,
        });
      }
    }

    resolve();
    return () => { cancelled = true; };
  }, [teams.initialized, teams.inTeams, teams.userId, teams.tenantId, teams.displayName]);

  return state;
}
