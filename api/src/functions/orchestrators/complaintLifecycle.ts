/**
 * Raksha API — Orchestrator: Complaint Lifecycle
 *
 * The MAIN durable orchestrator. Started when a complaint is submitted.
 * Manages the entire post-submission lifecycle:
 *
 *   Phase 1 — Post-submission pipeline:
 *     1. Generate complaint PDF
 *     2. Upload PDF to blob storage
 *     3. Update complaint with PDF URL
 *     4. Notify ICC + complainant
 *     5. Log audit trail
 *
 *   Phase 2 — Escalation (dead man's switch):
 *     6. Start escalationChain sub-orchestrator
 *     7. Wait for "complaint_acknowledged" event OR escalation completes
 *
 *   Phase 3 — Inquiry monitoring:
 *     8. On acknowledgement: set inquiryDeadline, notify complainant
 *     9. Start inquiryDeadline sub-orchestrator
 *    10. Wait for "complaint_resolved" event OR inquiry breaches
 *
 * Instance ID = complaint ID — allows raiseEvent by complaint ID from HTTP triggers.
 *
 * IMPORTANT — Orchestrator rules (Durable Functions):
 *   - MUST be deterministic: no Date.now(), no Math.random(), no I/O
 *   - Use context.df.currentUtcDateTime for time
 *   - All I/O goes in activity functions
 */

import * as df from "durable-functions";
import orchestrationConfig from "../../shared/orchestrationConfig";
import type {
  ComplaintLifecycleInput,
  FetchComplaintInput,
  FetchComplaintResult,
  UpdateStatusInput,
  LogAuditInput,
  EscalationChainInput,
  EscalationChainResult,
  InquiryDeadlineInput,
} from "../../shared/types";
import type { DispatchInput } from "../../shared/notificationDispatcher";

df.app.orchestration("complaintLifecycle", function* (context) {
  const input = context.df.getInput<ComplaintLifecycleInput>();
  if (!input) throw new Error("complaintLifecycle: no input provided");

  const { complaintId, tenantId } = input;

  // ════════════════════════════════════════════════════════════════════════
  // Step 0: Fetch complaint data from Cosmos (via activity — deterministic)
  // ════════════════════════════════════════════════════════════════════════

  const complaintData: FetchComplaintResult =
    yield context.df.callActivity("fetchComplaint", {
      complaintId,
      tenantId,
    } satisfies FetchComplaintInput);

  // Build template variables for notifications using real complaint data
  const ackDeadlineDate = new Date(context.df.currentUtcDateTime);
  ackDeadlineDate.setDate(
    ackDeadlineDate.getDate() + orchestrationConfig.acknowledgement.deadlineDays,
  );

  const templateVars: Record<string, string | number> = {
    complaintNumber: complaintData.complaintNumber,
    complaintId,
    deadlineDays: orchestrationConfig.acknowledgement.deadlineDays,
    deadlineDate: ackDeadlineDate.toISOString().split("T")[0],
    inquiryDeadlineDays: orchestrationConfig.inquiry.deadlineDays,
    submittedDate: context.df.currentUtcDateTime.toISOString().split("T")[0],
    category: complaintData.category,
    severity: complaintData.severity,
    criminalThreshold: complaintData.isCriminalThreshold ? "Yes" : "No",
  };

  // Populate complainant from real complaint data
  const complainant = {
    name: complaintData.complainantName,
    email: "", // Resolved at notification dispatch time from iccConfig/Graph
    userId: complaintData.complainantId,
  };

  // ════════════════════════════════════════════════════════════════════════
  // Phase 1: Post-submission pipeline
  // ════════════════════════════════════════════════════════════════════════

  // Step 1: Send submission notifications (ICC + complainant)
  yield context.df.callActivity("sendNotification", {
    notificationKey: "complaint_submitted",
    tenantId,
    templateVars,
    complainant,
  } satisfies DispatchInput);

  // Step 2: Log audit entry
  yield context.df.callActivity("logAudit", {
    complaintId,
    tenantId,
    action: "submitted",
    performedBy: "system",
    performedByRole: "system",
    details: {
      orchestrationId: context.df.instanceId,
    },
  } satisfies LogAuditInput);

  // ════════════════════════════════════════════════════════════════════════
  // Phase 2: Escalation — the dead man's switch
  // ════════════════════════════════════════════════════════════════════════

  if (orchestrationConfig.escalation.enabled) {
    // Start escalation chain as a sub-orchestrator (runs in parallel)
    const escalationTask = context.df.callSubOrchestrator(
      "escalationChain",
      {
        complaintId,
        tenantId,
        complainant,
        templateVars,
      } satisfies EscalationChainInput,
      `escalation-${complaintId}`,
    );

    // Wait for EITHER ICC acknowledgement OR escalation chain to complete
    const ackEvent = context.df.waitForExternalEvent("complaint_acknowledged");
    const winner: unknown = yield context.df.Task.any([
      ackEvent,
      escalationTask,
    ]);

    if (winner === ackEvent) {
      // ── ICC acknowledged ──
      // Read the event payload for audit attribution
      const ackData = (ackEvent as { result?: { iccMemberId?: string; timestamp?: string } }).result;
      const now = context.df.currentUtcDateTime;
      const inquiryDeadlineDate = new Date(now);
      inquiryDeadlineDate.setDate(
        inquiryDeadlineDate.getDate() +
          orchestrationConfig.inquiry.deadlineDays,
      );

      // Update complaint: submitted → under_inquiry + set inquiry deadlines
      yield context.df.callActivity("updateStatus", {
        complaintId,
        tenantId,
        updates: {
          status: "under_inquiry",
          acknowledgedAt: now.toISOString(),
          inquiryStartedAt: now.toISOString(),
          inquiryDeadline: inquiryDeadlineDate.toISOString(),
        },
      } satisfies UpdateStatusInput);

      // Notify complainant of acknowledgement
      yield context.df.callActivity("sendNotification", {
        notificationKey: "complaint_acknowledged",
        tenantId,
        templateVars: {
          ...templateVars,
          inquiryDeadlineDate: inquiryDeadlineDate
            .toISOString()
            .split("T")[0],
        },
        complainant,
      } satisfies DispatchInput);

      // Log acknowledgement with ICC attribution
      yield context.df.callActivity("logAudit", {
        complaintId,
        tenantId,
        action: "acknowledged",
        performedBy: ackData?.iccMemberId ?? "unknown",
        performedByRole: "icc",
        details: {
          acknowledgedAt: now.toISOString(),
          inquiryDeadline: inquiryDeadlineDate.toISOString(),
        },
      } satisfies LogAuditInput);

      // ══════════════════════════════════════════════════════════════════
      // Phase 3: Inquiry deadline monitoring
      // ══════════════════════════════════════════════════════════════════

      // Start inquiry deadline sub-orchestrator
      const inquiryTask = context.df.callSubOrchestrator(
        "inquiryDeadline",
        {
          complaintId,
          tenantId,
          inquiryStartedAt: now.toISOString(),
          complainant,
          templateVars: {
            ...templateVars,
            inquiryDeadlineDays: orchestrationConfig.inquiry.deadlineDays,
          },
        } satisfies InquiryDeadlineInput,
        `inquiry-${complaintId}`,
      );

      // Wait for resolution OR inquiry breach
      const resolveEvent =
        context.df.waitForExternalEvent("complaint_resolved");
      const resolveWinner: unknown = yield context.df.Task.any([
        resolveEvent,
        inquiryTask,
      ]);

      if (resolveWinner === resolveEvent) {
        // ── Complaint resolved ──
        const resolveData = (resolveEvent as { result?: { iccMemberId?: string; resolution?: string } }).result;
        const resolvedAt = context.df.currentUtcDateTime;

        yield context.df.callActivity("updateStatus", {
          complaintId,
          tenantId,
          updates: {
            status: "resolved",
            resolvedAt: resolvedAt.toISOString(),
            resolution: resolveData?.resolution ?? "",
          },
        } satisfies UpdateStatusInput);

        yield context.df.callActivity("sendNotification", {
          notificationKey: "complaint_resolved",
          tenantId,
          templateVars,
          complainant,
        } satisfies DispatchInput);

        yield context.df.callActivity("logAudit", {
          complaintId,
          tenantId,
          action: "resolved" as const,
          performedBy: resolveData?.iccMemberId ?? "unknown",
          performedByRole: "icc",
          details: {
            resolvedAt: resolvedAt.toISOString(),
            resolution: resolveData?.resolution ?? "",
          },
        } satisfies LogAuditInput);

        return {
          success: true,
          complaintId,
          outcome: "resolved",
        };
      }

      // Inquiry deadline sub-orchestrator completed (breach)
      return {
        success: true,
        complaintId,
        outcome: "inquiry_breached",
      };
    }

    // Escalation chain completed (all levels exhausted, complaint never acknowledged)
    // CRITICAL: Update status so daily safety net doesn't re-escalate forever
    const escalationResult =
      escalationTask.result as EscalationChainResult | undefined;

    yield context.df.callActivity("updateStatus", {
      complaintId,
      tenantId,
      updates: {
        status: "escalated",
        escalationLevel: escalationResult?.finalLevel ?? 2,
      },
    } satisfies UpdateStatusInput);

    yield context.df.callActivity("logAudit", {
      complaintId,
      tenantId,
      action: "escalated",
      performedBy: "system",
      performedByRole: "system",
      details: {
        outcome: "escalation_exhausted",
        finalLevel: escalationResult?.finalLevel ?? -1,
      },
    } satisfies LogAuditInput);

    return {
      success: true,
      complaintId,
      outcome: "escalation_exhausted",
      escalationLevel: escalationResult?.finalLevel ?? -1,
    };
  }

  // Escalation disabled — return after Phase 1
  return {
    success: true,
    complaintId,
    outcome: "submitted_no_escalation",
  };
});
