/**
 * Raksha — Orchestration Service
 *
 * Calls the Raksha API to start durable orchestrations after complaint submission.
 * Fire-and-forget: the complaint is already saved in Cosmos via submitDraft().
 * If the API is unreachable, the complaint is safe — orchestration can be
 * triggered manually later.
 */

import config from "../config";

const API_BASE_URL = config.api.baseUrl;
const TIMEOUT_MS = config.orchestration.orchestration.startTimeoutMs;

/**
 * Start the complaint lifecycle orchestration via the API.
 * Uses the complaint ID as the orchestration instance ID.
 *
 * Returns true if the orchestration was started successfully.
 * Returns false on failure (non-fatal — complaint is already in Cosmos).
 */
export async function startComplaintLifecycle(
  complaintId: string,
  tenantId: string,
): Promise<boolean> {
  const url = `${API_BASE_URL}/api/complaints/${encodeURIComponent(complaintId)}/submit`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (response.ok || response.status === 202) {
      console.log(`[raksha] Orchestration started for complaint ${complaintId}`);
      return true;
    }

    if (response.status === 409) {
      // Already running — that's fine
      console.log(`[raksha] Orchestration already running for complaint ${complaintId}`);
      return true;
    }

    console.warn(
      `[raksha] Failed to start orchestration: ${response.status} ${response.statusText}`,
    );
    return false;
  } catch (err) {
    // Non-fatal: complaint is saved, orchestration can be retried
    console.warn(`[raksha] Orchestration API unreachable for complaint ${complaintId}:`, err);
    return false;
  }
}
