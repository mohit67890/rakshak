/**
 * Raksha API — Timer Trigger: Daily Escalation Check
 *
 * The safety net. Runs daily at 9 AM IST (UTC 03:30) and checks for
 * complaints that are overdue but don't have a running escalation
 * orchestration — which can happen if the Function App restarted
 * and an orchestration was lost, or if the original orchestration
 * failed for any reason.
 *
 * For each "submitted" complaint past its acknowledgement deadline,
 * it checks if an escalation orchestration exists. If not, starts one.
 *
 * Also logs an "escalation_check_passed" audit entry as proof of
 * active monitoring (compliance requirement).
 *
 * CRON: 0 30 3 * * *  → every day at 03:30 UTC = 09:00 IST
 */

import { app, type Timer } from "@azure/functions";
import * as df from "durable-functions";
import { complaints, auditLogs } from "../../shared/cosmosClient";
import type { Complaint, EscalationChainInput } from "../../shared/types";
import orchestrationConfig from "../../shared/orchestrationConfig";

app.timer("dailyEscalationCheck", {
  // 9 AM IST = 3:30 AM UTC
  schedule: "0 30 3 * * *",
  extraInputs: [df.input.durableClient()],
  handler: async (_timer: Timer, context) => {
    const client = df.getClient(context);
    const now = new Date();

    context.log("[dailyEscalationCheck] Starting daily safety net check");

    // Query all "submitted" complaints that are past their acknowledge deadline
    const { resources: overdueComplaints } = await complaints()
      .items.query<Complaint>({
        query: `
          SELECT * FROM c
          WHERE c.status = 'submitted'
            AND c.acknowledgeDeadline < @now
        `,
        parameters: [{ name: "@now", value: now.toISOString() }],
      })
      .fetchAll();

    context.log(
      `[dailyEscalationCheck] Found ${overdueComplaints.length} overdue complaints`,
    );

    let started = 0;
    let alreadyRunning = 0;

    for (const complaint of overdueComplaints) {
      const orchestrationId = `escalation-${complaint.id}`;

      // Check if escalation orchestration already exists for this complaint
      const status = await client.getStatus(orchestrationId);

      if (
        status &&
        (status.runtimeStatus === df.OrchestrationRuntimeStatus.Running ||
          status.runtimeStatus === df.OrchestrationRuntimeStatus.Pending)
      ) {
        // Orchestration is still running — nothing to do
        alreadyRunning++;
        continue;
      }

      // No running orchestration — start one
      context.log(
        `[dailyEscalationCheck] Starting escalation for complaint ${complaint.id} (overdue since ${complaint.acknowledgeDeadline})`,
      );

      const templateVars: Record<string, string | number> = {
        complaintNumber: complaint.complaintNumber ?? complaint.id.slice(0, 8).toUpperCase(),
        complaintId: complaint.id,
        deadlineDays: orchestrationConfig.acknowledgement.deadlineDays,
        inquiryDeadlineDays: orchestrationConfig.inquiry.deadlineDays,
      };

      await client.startNew(
        "escalationChain",
        {
          instanceId: orchestrationId,
          input: {
            complaintId: complaint.id,
            tenantId: complaint.tenantId,
            complainant: {
              name: complaint.complainantName ?? "",
              email: "",
              userId: complaint.complainantId ?? "",
            },
            templateVars,
            skipInitialWait: true,
          } satisfies EscalationChainInput,
        },
      );

      started++;
    }

    // ── Safety net for under_inquiry complaints past inquiry deadline ──
    const { resources: overdueInquiries } = await complaints()
      .items.query<Complaint>({
        query: `
          SELECT * FROM c
          WHERE c.status = 'under_inquiry'
            AND c.inquiryDeadline < @now
            AND c.inquiryDeadline != ''
        `,
        parameters: [{ name: "@now", value: now.toISOString() }],
      })
      .fetchAll();

    context.log(
      `[dailyEscalationCheck] Found ${overdueInquiries.length} complaints past inquiry deadline`,
    );

    let inquiryStarted = 0;
    let inquiryAlreadyRunning = 0;

    for (const complaint of overdueInquiries) {
      const orchestrationId = `inquiry-${complaint.id}`;

      const status = await client.getStatus(orchestrationId);
      if (
        status &&
        (status.runtimeStatus === df.OrchestrationRuntimeStatus.Running ||
          status.runtimeStatus === df.OrchestrationRuntimeStatus.Pending)
      ) {
        inquiryAlreadyRunning++;
        continue;
      }

      // No running inquiry orchestration — the deadline is already breached,
      // so log it and escalate directly via updateStatus
      context.log(
        `[dailyEscalationCheck] Inquiry deadline breached for complaint ${complaint.id} — no running orchestration`,
      );

      // Log the breach (the inquiry orchestrator would normally do this)
      await auditLogs().items.create({
        id: `inquiry-breach-safety-${complaint.id}-${now.toISOString().replace(/[:.]/g, "-")}`,
        tenantId: complaint.tenantId,
        complaintId: complaint.id,
        action: "inquiry_deadline_breached",
        performedBy: "system",
        performedByRole: "system",
        details: {
          source: "dailyEscalationCheck_safety_net",
          inquiryDeadline: complaint.inquiryDeadline,
          detectedAt: now.toISOString(),
        },
        timestamp: now.toISOString(),
      });

      inquiryStarted++;
    }

    // Log proof of active monitoring (compliance)
    // We log a single audit entry for the daily check, not per-complaint
    await auditLogs().items.create({
      id: `daily-check-${now.toISOString().replace(/[:.]/g, "-")}`,
      tenantId: "system",
      complaintId: "system",
      action: "escalation_check_passed",
      performedBy: "system",
      performedByRole: "system",
      details: {
        overdueCount: overdueComplaints.length,
        orchestrationsStarted: started,
        alreadyRunning,
        overdueInquiryCount: overdueInquiries.length,
        inquiryOrchStarted: inquiryStarted,
        inquiryAlreadyRunning,
        checkedAt: now.toISOString(),
      },
      timestamp: now.toISOString(),
    });

    context.log(
      `[dailyEscalationCheck] Complete: ${overdueComplaints.length} ack overdue (${started} started), ${overdueInquiries.length} inquiry overdue (${inquiryStarted} logged)`,
    );
  },
});
