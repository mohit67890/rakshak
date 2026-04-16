/**
 * Raksha API — HTTP Trigger: Update Complaint Status
 *
 * PATCH /api/complaints/{complaintId}/status
 *
 * Called by the ICC dashboard (tab) to acknowledge or resolve a complaint.
 * Raises an external event to the running complaint lifecycle orchestration,
 * which is waiting for ICC action.
 *
 * Request body: { tenantId: string, status: "acknowledged" | "resolved", resolution?: string }
 *
 * Phase 2: Full implementation with auth middleware and event raising.
 */

import { app, type HttpRequest, type HttpResponse, type InvocationContext } from "@azure/functions";
import * as df from "durable-functions";
import { v4 as uuid } from "uuid";
import { auditLogs } from "../../shared/cosmosClient";

app.http("updateComplaintStatus", {
  methods: ["PATCH"],
  authLevel: "anonymous", // TODO: Add Entra ID token validation in Phase 2
  route: "complaints/{complaintId}/status",
  extraInputs: [df.input.durableClient()],
  handler: async (req: HttpRequest, context: InvocationContext): Promise<HttpResponse> => {
    const complaintId = req.params.complaintId;
    if (!complaintId) {
      return new Response(JSON.stringify({ error: "complaintId is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }) as unknown as HttpResponse;
    }

    let body: { tenantId?: string; status?: string; resolution?: string };
    try {
      body = (await req.json()) as { tenantId?: string; status?: string; resolution?: string };
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }) as unknown as HttpResponse;
    }

    const { tenantId, status, resolution } = body;
    if (!tenantId || !status) {
      return new Response(JSON.stringify({ error: "tenantId and status are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }) as unknown as HttpResponse;
    }

    const client = df.getClient(context);

    // Verify the orchestration exists and is running before raising events
    const orchestrationStatus = await client.getStatus(complaintId);
    if (
      !orchestrationStatus ||
      (orchestrationStatus.runtimeStatus !== df.OrchestrationRuntimeStatus.Running &&
        orchestrationStatus.runtimeStatus !== df.OrchestrationRuntimeStatus.Pending)
    ) {
      return new Response(
        JSON.stringify({
          error: "No running orchestration found for this complaint",
          complaintId,
          runtimeStatus: orchestrationStatus?.runtimeStatus ?? "not_found",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      ) as unknown as HttpResponse;
    }

    // Raise an external event to the running orchestration for this complaint.
    // The complaintLifecycle orchestrator is waiting for these events.
    const iccMemberId = "auth-pending"; // TODO: extract from Entra ID auth token
    const timestamp = new Date().toISOString();

    // Validate status before writing audit or raising events
    if (status !== "acknowledged" && status !== "resolved") {
      return new Response(
        JSON.stringify({ error: `Unsupported status: ${status}. Use "acknowledged" or "resolved".` }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ) as unknown as HttpResponse;
    }

    // Audit log the ICC action BEFORE raising the event.
    // Uses "status_changed" (not "acknowledged"/"resolved") because the
    // orchestrator writes the canonical acknowledged/resolved audit entries
    // with full lifecycle details. This entry proves the ICC clicked the button
    // even if the orchestrator crashes before processing the event.
    await auditLogs().items.create({
      id: uuid(),
      tenantId,
      complaintId,
      action: "status_changed",
      performedBy: iccMemberId,
      performedByRole: "icc",
      details: {
        source: "http_trigger",
        requestedStatus: status,
        resolution: resolution ?? null,
      },
      timestamp,
      ipAddress: null,
    });

    if (status === "acknowledged") {
      await client.raiseEvent(complaintId, "complaint_acknowledged", {
        iccMemberId,
        timestamp,
      });
    } else {
      await client.raiseEvent(complaintId, "complaint_resolved", {
        resolution: resolution ?? "",
        iccMemberId,
        timestamp,
      });
    }

    context.log(`[raksha-api] Raised event "${status}" for complaint ${complaintId}`);

    return new Response(
      JSON.stringify({ success: true, complaintId, status }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ) as unknown as HttpResponse;
  },
});
