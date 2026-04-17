/**
 * Raksha API — HTTP Trigger: Appeal Complaint
 *
 * POST /api/complaints/{complaintId}/appeal
 *
 * Allows the complainant to formally appeal to a higher authority
 * (Audit Committee or District Officer) when they are unsatisfied with
 * ICC handling — either because the complaint was resolved unfavourably,
 * the ICC is unresponsive, or the 90-day inquiry deadline has been breached.
 *
 * This is the employee-initiated counterpart to the system-driven
 * auto-escalation in escalationChain.ts.
 *
 * Request body:
 *   { tenantId: string, userId: string, targetLevel: 1 | 2, reason: string }
 *
 * Side effects:
 *   - Updates the complaint doc (appeal fields, status → "escalated",
 *     escalationLevel bumped to targetLevel).
 *   - Fires the complaint_appealed_* notification (email + bot).
 *   - Writes an "appealed" audit log entry.
 */

import { app, type HttpRequest, type HttpResponse, type InvocationContext } from "@azure/functions";
import { v4 as uuid } from "uuid";
import { complaints, auditLogs, iccConfig } from "../../shared/cosmosClient";
import { dispatchNotification } from "../../shared/notificationDispatcher";
import type { Complaint } from "../../shared/types";

interface AppealRequest {
  tenantId?: string;
  userId?: string;
  targetLevel?: number;
  reason?: string;
}

interface IccMemberDoc {
  userId: string;
  name: string;
  email: string;
}

interface IccConfigDoc {
  tenantId: string;
  iccMembers: IccMemberDoc[];
  settings?: { acknowledgementDeadlineDays?: number; inquiryDeadlineDays?: number };
}

function json(body: unknown, status = 200): HttpResponse {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  }) as unknown as HttpResponse;
}

/**
 * Decide whether the complainant is allowed to appeal right now.
 * Rules:
 *   - Must be the complainant themselves.
 *   - Complaint must exist and not be a draft.
 *   - Only one active appeal at a time (pending / under_review).
 *   - Appeals are allowed when any of:
 *       a) status === "resolved" (unsatisfied with outcome), or
 *       b) ICC has failed to acknowledge by deadline, or
 *       c) Inquiry deadline (90 days) has passed without resolution, or
 *       d) A previous appeal was rejected (so the complainant can escalate
 *          to the next higher authority).
 *     Otherwise the complainant should wait.
 *   - Cannot appeal beyond the District Officer (level 2).
 */
function checkEligibility(
  complaint: Complaint,
  userId: string,
): { ok: true } | { ok: false; error: string; status: number } {
  if (complaint.complainantId !== userId) {
    return { ok: false, error: "Only the complainant can file an appeal", status: 403 };
  }
  if (complaint.status === "draft") {
    return { ok: false, error: "Cannot appeal a draft complaint", status: 400 };
  }
  if (complaint.appealStatus === "pending" || complaint.appealStatus === "under_review") {
    return { ok: false, error: "An appeal is already in progress for this complaint", status: 409 };
  }
  if (complaint.appealedToLevel && complaint.appealedToLevel >= 2) {
    return {
      ok: false,
      error:
        "This complaint has already been appealed to the highest internal authority (District Officer). You retain the right to approach the courts under POSH Act §18.",
      status: 409,
    };
  }

  const now = Date.now();
  const ackMissed =
    !complaint.acknowledgedAt &&
    complaint.acknowledgeDeadline &&
    new Date(complaint.acknowledgeDeadline).getTime() < now;
  const inquiryBreached =
    !complaint.resolvedAt &&
    complaint.inquiryDeadline &&
    new Date(complaint.inquiryDeadline).getTime() < now;
  const resolved = complaint.status === "resolved" || !!complaint.resolvedAt;
  const priorRejected = complaint.appealStatus === "rejected";

  if (!resolved && !ackMissed && !inquiryBreached && !priorRejected) {
    return {
      ok: false,
      error:
        "You can only appeal once the complaint is resolved, the ICC has missed the acknowledgement deadline, or the 90-day inquiry deadline has been breached.",
      status: 400,
    };
  }

  return { ok: true };
}

app.http("appealComplaint", {
  methods: ["POST"],
  authLevel: "anonymous", // TODO: Validate Entra ID token in Phase 2
  route: "complaints/{complaintId}/appeal",
  handler: async (req: HttpRequest, context: InvocationContext): Promise<HttpResponse> => {
    const complaintId = req.params.complaintId;
    if (!complaintId) return json({ error: "complaintId is required" }, 400);

    let body: AppealRequest;
    try {
      body = (await req.json()) as AppealRequest;
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const { tenantId, userId, targetLevel, reason } = body;

    if (!tenantId || !userId) {
      return json({ error: "tenantId and userId are required" }, 400);
    }
    if (targetLevel !== 1 && targetLevel !== 2) {
      return json({ error: "targetLevel must be 1 (Audit Committee) or 2 (District Officer)" }, 400);
    }
    const trimmedReason = (reason ?? "").trim();
    if (trimmedReason.length < 20) {
      return json({ error: "Please provide a reason of at least 20 characters" }, 400);
    }
    if (trimmedReason.length > 2000) {
      return json({ error: "Reason must not exceed 2000 characters" }, 400);
    }

    // 1. Load complaint
    const { resource: existing, etag } = await complaints()
      .item(complaintId, tenantId)
      .read<Complaint>();

    if (!existing) return json({ error: "Complaint not found" }, 404);

    // Cannot downgrade an appeal (target must be strictly above current level)
    if (existing.appealedToLevel && targetLevel <= existing.appealedToLevel) {
      return json(
        { error: `This complaint has already been appealed to level ${existing.appealedToLevel}. Appeal to a higher level only.` },
        409,
      );
    }

    // 2. Eligibility
    const gate = checkEligibility(existing, userId);
    if (!gate.ok) return json({ error: gate.error }, gate.status);

    const now = new Date().toISOString();

    // 3. Update complaint document (optimistic concurrency via etag)
    const updated: Complaint = {
      ...existing,
      status: "escalated",
      escalationLevel: Math.max(existing.escalationLevel ?? 0, targetLevel),
      appealStatus: "pending",
      appealedAt: now,
      appealReason: trimmedReason,
      appealedToLevel: targetLevel,
      appealReviewedAt: null,
      appealOutcome: null,
      updatedAt: now,
      version: (existing.version ?? 0) + 1,
    };

    try {
      await complaints().item(complaintId, tenantId).replace(updated, {
        accessCondition: etag ? { type: "IfMatch", condition: etag } : undefined,
      });
    } catch (err) {
      const e = err as { code?: number; message?: string };
      if (e.code === 412) {
        return json(
          { error: "Complaint was modified by someone else. Please refresh and try again." },
          409,
        );
      }
      context.error(`[raksha-api] appealComplaint: failed to update complaint`, err);
      return json({ error: "Failed to save appeal", details: e.message ?? String(err) }, 500);
    }

    // 4. Audit log (append-only)
    await auditLogs().items.create({
      id: uuid(),
      tenantId,
      complaintId,
      action: "appealed",
      performedBy: userId,
      performedByRole: "employee",
      details: {
        targetLevel,
        targetAuthority: targetLevel === 1 ? "audit_committee" : "district_officer",
        reason: trimmedReason,
        previousStatus: existing.status,
      },
      timestamp: now,
      ipAddress: null,
    });

    // 5. Notify via dispatcher (best-effort — do not fail the request on notify errors)
    //    Complainant info comes from iccConfig is NOT reliable here (complainant isn't
    //    stored there); we pass from the complaint record. Email lookup: if we have
    //    no email, leave empty so the bot channel still fires.
    const notificationKey =
      targetLevel === 1
        ? "complaint_appealed_audit_committee"
        : "complaint_appealed_district_officer";

    // Best-effort lookup of complainant email from iccConfig (rare) — fallback: no email
    let complainantEmail = "";
    try {
      const { resources } = await iccConfig()
        .items.query({
          query: "SELECT * FROM c WHERE c.tenantId = @tenantId",
          parameters: [{ name: "@tenantId", value: tenantId }],
        })
        .fetchAll();
      const cfg = resources?.[0] as IccConfigDoc | undefined;
      const match = cfg?.iccMembers?.find((m) => m.userId === userId);
      if (match?.email) complainantEmail = match.email;
    } catch {
      // non-fatal
    }

    try {
      const dispatchResult = await dispatchNotification({
        notificationKey,
        tenantId,
        templateVars: {
          complaintNumber: existing.complaintNumber,
          appealReason: trimmedReason,
          currentStatus: existing.status,
          submittedDate: existing.submittedAt || existing.createdAt,
          targetAuthority: targetLevel === 1 ? "Audit Committee" : "District Officer",
        },
        complainant: {
          name: existing.complainantName || "Complainant",
          email: complainantEmail,
          userId: existing.complainantId,
        },
      });
      context.log(
        `[raksha-api] Appeal dispatched for ${complaintId}: ${dispatchResult.emailsSent} emails, ${dispatchResult.botMessagesSent} bot msgs, ${dispatchResult.errors.length} errors`,
      );
      if (dispatchResult.errors.length > 0) {
        context.warn(`[raksha-api] Appeal notification errors:`, dispatchResult.errors);
      }
    } catch (err) {
      // Do not fail the appeal if notifications fail — appeal is already persisted.
      context.error(`[raksha-api] Failed to dispatch appeal notification`, err);
    }

    return json({
      success: true,
      complaintId,
      appealStatus: "pending",
      appealedToLevel: targetLevel,
      appealedAt: now,
    });
  },
});
