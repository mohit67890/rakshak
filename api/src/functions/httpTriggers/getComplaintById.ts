/**
 * Raksha API — HTTP Trigger: Get Complaint By ID
 *
 * GET /api/complaints/{complaintId}?tenantId={tenantId}&userId={userId}&role={employee|icc}
 *
 * Returns a single complaint with its full audit timeline.
 * Employees can only view their own complaints; ICC can view any for their tenant.
 */

import { app, type HttpRequest, type HttpResponse, type InvocationContext } from "@azure/functions";
import { complaints, auditLogs } from "../../shared/cosmosClient";
import { addSasToEvidenceUrls } from "../../shared/blobHelpers";

app.http("getComplaintById", {
  methods: ["GET"],
  authLevel: "anonymous", // TODO: Add Entra ID token validation
  route: "complaints/{complaintId}",
  handler: async (req: HttpRequest, _context: InvocationContext): Promise<HttpResponse> => {
    const complaintId = req.params.complaintId;
    const tenantId = req.query.get("tenantId");
    const userId = req.query.get("userId");
    const role = req.query.get("role") ?? "employee";

    if (!complaintId || !tenantId || !userId) {
      return new Response(
        JSON.stringify({ error: "complaintId, tenantId, and userId are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ) as unknown as HttpResponse;
    }

    try {
      // Read the complaint
      const { resource: complaint } = await complaints()
        .item(complaintId, tenantId)
        .read();

      if (!complaint) {
        return new Response(
          JSON.stringify({ error: "Complaint not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        ) as unknown as HttpResponse;
      }

      // Authorization: employees can only view their own complaints
      if (role === "employee" && complaint.complainantId !== userId) {
        return new Response(
          JSON.stringify({ error: "Access denied" }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        ) as unknown as HttpResponse;
      }

      // Fetch audit trail (timeline) for this complaint
      const { resources: timeline } = await auditLogs()
        .items.query(
          {
            query: "SELECT * FROM c WHERE c.complaintId = @complaintId ORDER BY c.timestamp ASC",
            parameters: [{ name: "@complaintId", value: complaintId }],
          },
          { partitionKey: tenantId },
        )
        .fetchAll();

      // Strip Cosmos internal fields
      const { _rid, _self, _etag, _attachments, _ts, ...cleanComplaint } = complaint;

      // Transform evidence blob URLs to time-limited SAS URLs for the tab
      const withSasUrls = addSasToEvidenceUrls(cleanComplaint);

      return new Response(
        JSON.stringify({ complaint: withSasUrls, timeline }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ) as unknown as HttpResponse;
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch complaint", details: (err as Error).message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      ) as unknown as HttpResponse;
    }
  },
});
