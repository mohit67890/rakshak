/**
 * Raksha API — Teams Activity Feed Sender
 *
 * Sends activity feed notifications via Microsoft Graph API.
 * These appear as bell/badge notifications in Teams — users see them
 * in their activity feed without opening the chat.
 *
 * Graph API: POST /users/{userId}/teamwork/sendActivityNotification
 *
 * Required Entra app permissions:
 *   - TeamsActivity.Send (Application)
 *
 * Required manifest additions:
 *   - webApplicationInfo.id = bot app ID
 *   - activities.activityTypes[] with type, description, templateText
 *
 * Activity types defined in manifest:
 *   - complaintUpdate:   "{statusUpdate}"
 *   - escalationAlert:   "{escalationMessage}"
 *   - deadlineReminder:  "{reminderMessage}"
 */

import { ClientSecretCredential } from "@azure/identity";
import config from "./config";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const GRAPH_SCOPE = "https://graph.microsoft.com/.default";

// ============================================================================
// Types
// ============================================================================

/**
 * Activity type must match one defined in appPackage/manifest.json → activities.activityTypes
 */
export type ActivityType = "complaintUpdate" | "escalationAlert" | "deadlineReminder";

export interface ActivityFeedInput {
  /** Entra object ID of the recipient user */
  userId: string;
  /** Activity type — must match manifest activityTypes */
  activityType: ActivityType;
  /** Preview text shown in the activity feed list */
  previewText: string;
  /** Template parameters — keys must match {placeholders} in manifest templateText */
  templateParameters: Record<string, string>;
}

export interface ActivityFeedResult {
  success: boolean;
  error?: string;
}

// ============================================================================
// Credential (shared with graphEmailSender but independent for clarity)
// ============================================================================

let credential: ClientSecretCredential | null = null;

function getCredential(): ClientSecretCredential {
  if (!credential) {
    const { clientId, clientSecret, tenantId } = config.graph;
    if (!clientId || !clientSecret || !tenantId) {
      throw new Error(
        "[activityFeedSender] Missing GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, or GRAPH_TENANT_ID",
      );
    }
    credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
  }
  return credential;
}

async function getAccessToken(): Promise<string> {
  const tokenResponse = await getCredential().getToken(GRAPH_SCOPE);
  return tokenResponse.token;
}

// ============================================================================
// Send Activity Feed Notification
// ============================================================================

/**
 * Send an activity feed notification to a user in Teams.
 *
 * The notification appears in the user's activity feed (bell icon).
 * It uses the "systemDefault" topic source which doesn't require
 * a specific resource URL — works for personal-scope bot apps.
 */
export async function sendActivityFeedNotification(
  input: ActivityFeedInput,
): Promise<ActivityFeedResult> {
  if (!input.userId) {
    return { success: false, error: "Missing userId" };
  }

  const token = await getAccessToken();

  const payload = {
    topic: {
      source: "text",
      value: "Rakshak — Workplace Safety",
      webUrl: "",
    },
    activityType: input.activityType,
    previewText: {
      content: input.previewText,
    },
    templateParameters: Object.entries(input.templateParameters).map(
      ([name, value]) => ({ name, value }),
    ),
  };

  const url = `${GRAPH_BASE}/users/${encodeURIComponent(input.userId)}/teamwork/sendActivityNotification`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (response.status === 204 || response.status === 202 || response.ok) {
    console.log(
      `[activityFeedSender] Sent "${input.activityType}" to user ${input.userId}: "${input.previewText.substring(0, 80)}"`,
    );
    return { success: true };
  }

  const errorBody = await response.text();
  console.error(
    `[activityFeedSender] Graph API error ${response.status}: ${errorBody}`,
  );
  return {
    success: false,
    error: `Graph API ${response.status}: ${errorBody}`,
  };
}

/** Reset credential — for testing */
export function _resetCredential(): void {
  credential = null;
}
