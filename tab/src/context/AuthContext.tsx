/**
 * Raksha Tab — Auth Context
 *
 * Provides the authenticated user to all child components.
 * Resolves Teams identity once via useTeams, then determines role via API.
 * Pages consume this context instead of calling useAuth directly.
 */

import { createContext, useContext, type ReactNode } from "react";
import type { AuthUser } from "../hooks/useAuth";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  error: null,
});

export function AuthProvider({
  user,
  loading,
  error,
  children,
}: AuthContextValue & { children: ReactNode }) {
  return (
    <AuthContext.Provider value={{ user, loading, error }}>
      {children}
    </AuthContext.Provider>
  );
}

/** Hook for pages to get the current user. Never hangs — context is pre-resolved. */
export function useCurrentUser(): AuthContextValue {
  return useContext(AuthContext);
}
