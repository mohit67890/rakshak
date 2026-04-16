/**
 * Raksha API — HTTP Trigger: Submit Complaint
 *
 * POST /api/complaints/{complaintId}/submit
 *
 * Starts the complaintLifecycle durable orchestration for a submitted complaint.
 * Called by the bot after submitDraft() transitions the complaint to "submitted".
 *
 * The orchestration instance ID is set to the complaint ID, making it trivial
 * to raise events and query status later.
 *
 * Request body: { tenantId: string }
 * Returns: Durable Functions status check URLs (or 409 if already running)
 */

import { app, type HttpRequest, type HttpResponse, type InvocationContext } from "@azure/functions";
import * as df from "durable-functions";
import type { ComplaintLifecycleInput } from "../../shared/types";

app.http("submitComplaint", {
  methods: ["POST"],
  authLevel: "anonymous", // TODO: Add auth middleware in Phase 2
  route: "complaints/{complaintId}/submit",
  extraInputs: [df.input.durableClient()],
  handler: async (req: HttpRequest, context: InvocationContext): Promise<HttpResponse> => {
    const complaintId = req.params.complaintId;
    if (!complaintId) {
      return new Response(JSON.stringify({ error: "complaintId is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }) as unknown as HttpResponse;
    }

    let body: { tenantId?: string };
    try {
      body = (await req.json()) as { tenantId?: string };
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }) as unknown as HttpResponse;
    }

    const tenantId = body.tenantId;
    if (!tenantId) {
      return new Response(JSON.stringify({ error: "tenantId is required in body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }) as unknown as HttpResponse;
    }

    const client = df.getClient(context);

    // Check if orchestration is already running for this complaint
    const existing = await client.getStatus(complaintId);
    if (
      existing &&
      (existing.runtimeStatus === df.OrchestrationRuntimeStatus.Running ||
        existing.runtimeStatus === df.OrchestrationRuntimeStatus.Pending)
    ) {
      return new Response(
        JSON.stringify({
          error: "Orchestration already running for this complaint",
          instanceId: complaintId,
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      ) as unknown as HttpResponse;
    }

    // Start the complaint lifecycle orchestration
    const orchestrationInput: ComplaintLifecycleInput = { complaintId, tenantId };
    const instanceId = await client.startNew("complaintLifecycle", {
      instanceId: complaintId,
      input: orchestrationInput,
    });

    context.log(`[raksha-api] Started complaintLifecycle orchestration: ${instanceId}`);

    return client.createCheckStatusResponse(req, instanceId);
  },
});
