/**
 * Raksha API — Orchestrator: Inquiry Deadline Monitor
 *
 * Started by complaintLifecycle after ICC acknowledges.
 * Monitors the 90-day statutory inquiry window (POSH Act Section 11).
 *
 * Sends reminders at configured day offsets (60, 75, 85, 89 by default),
 * then checks if the inquiry was completed by day 90. If not, logs a
 * breach and sends escalation notifications.
 *
 * Self-terminates at each reminder if the complaint has been resolved.
 *
 * Orchestrator rules:
 *   - MUST be deterministic: no Date.now(), no Math.random(), no I/O
 *   - Use context.df.currentUtcDateTime for time
 *   - All I/O goes in activity functions
 */

import * as df from "durable-functions";
import orchestrationConfig from "../../shared/orchestrationConfig";
import type {
  InquiryDeadlineInput,
  CheckComplaintStatusInput,
  CheckComplaintStatusResult,
  LogAuditInput,
  UpdateStatusInput,
} from "../../shared/types";
import type { DispatchInput } from "../../shared/notificationDispatcher";

df.app.orchestration("inquiryDeadline", function* (context) {
  const input = context.df.getInput<InquiryDeadlineInput>();
  if (!input) throw new Error("inquiryDeadline: no input provided");

  const { complaintId, tenantId, inquiryStartedAt, complainant, templateVars } =
    input;
  const { inquiry } = orchestrationConfig;
  const inquiryStart = new Date(inquiryStartedAt);

  // ── Send reminders at configured day offsets ──
  for (const reminder of inquiry.reminders) {
    // Calculate the absolute date for this reminder
    const reminderDate = new Date(inquiryStart);
    reminderDate.setDate(reminderDate.getDate() + reminder.dayOffset);

    // Only set timer if the reminder date is in the future
    if (reminderDate > context.df.currentUtcDateTime) {
      yield context.df.createTimer(reminderDate);
    }

    // ── Self-termination check ──
    const statusCheck: CheckComplaintStatusResult =
      yield context.df.callActivity("checkComplaintStatus", {
        complaintId,
        tenantId,
      } satisfies CheckComplaintStatusInput);

    if (statusCheck.resolvedAt) {
      // Complaint resolved — no more reminders needed
      context.log(
        `[inquiryDeadline] Complaint ${complaintId} resolved — stopping reminders`,
      );
      return { breached: false, selfTerminated: true };
    }

    // Calculate days remaining for template
    const inquiryDeadlineDate = new Date(inquiryStart);
    inquiryDeadlineDate.setDate(
      inquiryDeadlineDate.getDate() + inquiry.deadlineDays,
    );
    const daysRemaining =
      inquiry.deadlineDays - reminder.dayOffset;

    // Send the reminder notification
    yield context.df.callActivity("sendNotification", {
      notificationKey: reminder.notification,
      tenantId,
      templateVars: {
        ...templateVars,
        daysRemaining,
        inquiryDeadlineDate: inquiryDeadlineDate.toISOString().split("T")[0],
        urgency: reminder.urgency,
      },
      complainant,
    } satisfies DispatchInput);

    // Audit log each reminder — legally required proof reminders were sent
    yield context.df.callActivity("logAudit", {
      complaintId,
      tenantId,
      action: "inquiry_reminder_sent",
      performedBy: "system",
      performedByRole: "system",
      details: {
        dayOffset: reminder.dayOffset,
        daysRemaining,
        urgency: reminder.urgency,
        notificationKey: reminder.notification,
        inquiryDeadlineDate: inquiryDeadlineDate.toISOString().split("T")[0],
      },
    } satisfies LogAuditInput);

    context.log(
      `[inquiryDeadline] Reminder sent for ${complaintId}: ${daysRemaining} days remaining (${reminder.urgency})`,
    );
  }

  // ── Day 90: Deadline check ──
  const finalDeadline = new Date(inquiryStart);
  finalDeadline.setDate(finalDeadline.getDate() + inquiry.deadlineDays);

  if (finalDeadline > context.df.currentUtcDateTime) {
    yield context.df.createTimer(finalDeadline);
  }

  // Final status check
  const finalCheck: CheckComplaintStatusResult =
    yield context.df.callActivity("checkComplaintStatus", {
      complaintId,
      tenantId,
    } satisfies CheckComplaintStatusInput);

  if (finalCheck.resolvedAt) {
    context.log(
      `[inquiryDeadline] Complaint ${complaintId} resolved before deadline`,
    );
    return { breached: false, selfTerminated: true };
  }

  // ── BREACH: 90-day deadline passed without resolution ──
  context.log(
    `[inquiryDeadline] BREACH: Complaint ${complaintId} — 90-day inquiry deadline exceeded`,
  );

  // Log the breach
  yield context.df.callActivity("logAudit", {
    complaintId,
    tenantId,
    action: "inquiry_deadline_breached",
    performedBy: "system",
    performedByRole: "system",
    details: {
      inquiryStartedAt,
      inquiryDeadlineDays: inquiry.deadlineDays,
      deadlineDate: finalDeadline.toISOString(),
    },
  } satisfies LogAuditInput);

  // Send breach notifications (complainant + escalation)
  for (const notificationKey of inquiry.onBreach.notifications) {
    yield context.df.callActivity("sendNotification", {
      notificationKey,
      tenantId,
      templateVars: {
        ...templateVars,
        daysRemaining: 0,
        inquiryDeadlineDate: finalDeadline.toISOString().split("T")[0],
      },
      complainant,
    } satisfies DispatchInput);
  }

  // Update escalation level (never downgrade)
  yield context.df.callActivity("updateStatus", {
    complaintId,
    tenantId,
    updates: { escalationLevel: Math.max(finalCheck.escalationLevel, 1) },
  } satisfies UpdateStatusInput);

  return { breached: true, selfTerminated: false };
});
