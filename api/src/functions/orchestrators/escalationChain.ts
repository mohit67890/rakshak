/**
 * Raksha API — Orchestrator: Escalation Chain
 *
 * The dead man's switch. Started as a sub-orchestrator by complaintLifecycle
 * after submission. Waits for the acknowledgement deadline, then escalates
 * through configured levels until someone acts or the chain is exhausted.
 *
 * Levels (from orchestration.config.json):
 *   0 — ICC Reminder:      nudge ICC that deadline was missed
 *   1 — Audit Committee:   escalate to Companies Act vigil mechanism
 *   2 — District Officer:  escalate to POSH Act Section 6 authority
 *
 * CRITICAL: Self-terminates at each step by checking complaint status.
 * Durable Functions don't support cancelling sub-orchestrators, so the
 * chain must check Cosmos and stop if the complaint was already acknowledged.
 *
 * Orchestrator rules:
 *   - MUST be deterministic: no Date.now(), no Math.random(), no I/O
 *   - Use context.df.currentUtcDateTime for time
 *   - All I/O goes in activity functions
 */

import * as df from "durable-functions";
import orchestrationConfig from "../../shared/orchestrationConfig";
import type {
  EscalationChainInput,
  EscalationChainResult,
  CheckComplaintStatusInput,
  CheckComplaintStatusResult,
  UpdateStatusInput,
  LogAuditInput,
} from "../../shared/types";
import type { DispatchInput } from "../../shared/notificationDispatcher";

df.app.orchestration("escalationChain", function* (context) {
  const input = context.df.getInput<EscalationChainInput>();
  if (!input) throw new Error("escalationChain: no input provided");

  const { complaintId, tenantId, complainant, templateVars } = input;
  const { acknowledgement, escalation } = orchestrationConfig;

  // ── Wait for acknowledgement deadline (unless started by safety net) ──
  if (!input.skipInitialWait) {
    const deadline = new Date(context.df.currentUtcDateTime);
    deadline.setDate(deadline.getDate() + acknowledgement.deadlineDays);
    yield context.df.createTimer(deadline);
  }

  // ── Walk through escalation levels ──
  let lastLevel = -1;

  for (const level of escalation.levels) {
    // Wait additional days between levels (level 0 has waitDaysAfterPrevious=0)
    if (level.waitDaysAfterPrevious > 0) {
      const levelDeadline = new Date(context.df.currentUtcDateTime);
      levelDeadline.setDate(
        levelDeadline.getDate() + level.waitDaysAfterPrevious,
      );
      yield context.df.createTimer(levelDeadline);
    }

    // ── Self-termination check ──
    // Read complaint status from Cosmos. If someone acknowledged while
    // we were waiting, stop the chain and log that we checked.
    const statusCheck: CheckComplaintStatusResult =
      yield context.df.callActivity("checkComplaintStatus", {
        complaintId,
        tenantId,
      } satisfies CheckComplaintStatusInput);

    if (statusCheck.status !== "submitted") {
      // Complaint was handled — log proof of monitoring and exit
      yield context.df.callActivity("logAudit", {
        complaintId,
        tenantId,
        action: "escalation_check_passed",
        performedBy: "system",
        performedByRole: "system",
        details: {
          level: level.level,
          levelName: level.name,
          complaintStatus: statusCheck.status,
          reason: "Complaint no longer in submitted state — escalation chain self-terminated",
        },
      } satisfies LogAuditInput);

      return {
        escalated: lastLevel >= 1,
        finalLevel: lastLevel,
        selfTerminated: true,
      } satisfies EscalationChainResult;
    }

    // ── Execute this escalation level ──

    // If action is "escalate", update the complaint's escalationLevel
    if (level.action === "escalate") {
      yield context.df.callActivity("updateStatus", {
        complaintId,
        tenantId,
        updates: { escalationLevel: level.level },
      } satisfies UpdateStatusInput);
    }

    // Send all configured notifications for this level
    for (const notificationKey of level.notifications) {
      yield context.df.callActivity("sendNotification", {
        notificationKey,
        tenantId,
        templateVars: {
          ...templateVars,
          escalationLevel: level.level,
          escalationLevelName: level.name,
          escalationWaitDays: level.waitDaysAfterPrevious,
        },
        complainant,
      } satisfies DispatchInput);
    }

    // Determine the right audit action for this level
    const auditAction =
      level.level === 0
        ? "reminder_sent_icc"
        : level.level === 1
          ? "escalated_audit_committee"
          : "escalated_district_officer";

    yield context.df.callActivity("logAudit", {
      complaintId,
      tenantId,
      action: auditAction,
      performedBy: "system",
      performedByRole: "system",
      details: {
        level: level.level,
        levelName: level.name,
        action: level.action,
        notifications: level.notifications,
      },
    } satisfies LogAuditInput);

    lastLevel = level.level;

    context.log(
      `[escalationChain] Level ${level.level} (${level.name}) executed for complaint ${complaintId}`,
    );
  }

  // All levels exhausted — complaint was never acknowledged
  return {
    escalated: true,
    finalLevel: lastLevel,
    selfTerminated: false,
  } satisfies EscalationChainResult;
});
