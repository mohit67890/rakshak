/**
 * Raksha Tab — Teams SDK Hook
 *
 * Initializes the Teams JS SDK, retrieves context, and exposes
 * user identity so other hooks don't need to call getContext() again.
 *
 * The Teams context is resolved ONCE here. useAuth reads it from this hook.
 */

import { useState, useEffect } from "react";
import { app as teamsApp, type app as TeamsAppType } from "@microsoft/teams-js";

type TeamsTheme = "default" | "dark" | "contrast";

export interface TeamsState {
  initialized: boolean;
  theme: TeamsTheme;
  error: string | null;
  /** True when running inside a Teams iframe, false for standalone browser */
  inTeams: boolean;
  /** User identity from Teams context (null in standalone) */
  userId: string | null;
  tenantId: string | null;
  displayName: string | null;
}

export function useTeams(): TeamsState {
  const [state, setState] = useState<TeamsState>({
    initialized: false,
    theme: "default",
    error: null,
    inTeams: false,
    userId: null,
    tenantId: null,
    displayName: null,
  });

  useEffect(() => {
    teamsApp
      .initialize()
      .then(() => {
        // Tell Teams the frame is alive (prevents blank page timeout)
        teamsApp.notifyAppLoaded();
        return teamsApp.getContext();
      })
      .then((context: Awaited<ReturnType<typeof TeamsAppType.getContext>>) => {
        setState({
          initialized: true,
          theme: (context.app?.theme as TeamsTheme) ?? "default",
          error: null,
          inTeams: true,
          userId: context.user?.id ?? null,
          tenantId: context.user?.tenant?.id ?? null,
          displayName: context.user?.displayName ?? null,
        });

        // Listen for theme changes
        teamsApp.registerOnThemeChangeHandler((newTheme) => {
          setState((prev) => ({ ...prev, theme: newTheme as TeamsTheme }));
        });

        // Notify Teams that the app has loaded
        teamsApp.notifySuccess();
      })
      .catch((err) => {
        // Outside Teams — run in browser standalone mode
        console.warn("[raksha-tab] Teams SDK init failed (standalone mode):", err);
        setState({
          initialized: true,
          theme: "default",
          error: null,
          inTeams: false,
          userId: null,
          tenantId: null,
          displayName: null,
        });
      });
  }, []);

  return state;
}
