/**
 * Raksha API — HTTP Trigger: Get Complaints
 *
 * GET /api/complaints?tenantId={tenantId}&userId={userId}&role={employee|icc}
 *
 * Returns complaints based on the caller's role:
 *   - employee: only their own complaints
 *   - icc: all complaints for the tenant
 *
 * TODO: Replace query params with Entra ID token claims once auth middleware is added.
 */

import { app, type HttpRequest, type HttpResponse, type InvocationContext } from "@azure/functions";
import { complaints } from "../../shared/cosmosClient";
import { addSasToEvidenceUrls } from "../../shared/blobHelpers";

app.http("getComplaints", {
  methods: ["GET"],
  authLevel: "anonymous", // TODO: Add Entra ID token validation
  route: "complaints",
  handler: async (req: HttpRequest, _context: InvocationContext): Promise<HttpResponse> => {
    const tenantId = req.query.get("tenantId");
    const userId = req.query.get("userId");
    const role = req.query.get("role") ?? "employee";

    if (!tenantId || !userId) {
      return new Response(
        JSON.stringify({ error: "tenantId and userId are required query parameters" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ) as unknown as HttpResponse;
    }

    if (role !== "employee" && role !== "icc") {
      return new Response(
        JSON.stringify({ error: "role must be 'employee' or 'icc'" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ) as unknown as HttpResponse;
    }

    try {
      let query: string;
      let parameters: Array<{ name: string; value: string }>;

      if (role === "icc") {
        // ICC members see all non-draft complaints for their tenant
        query = "SELECT * FROM c WHERE c.status != 'draft' ORDER BY c.updatedAt DESC";
        parameters = [];
      } else {
        // Employees see only their own complaints
        query = "SELECT * FROM c WHERE c.complainantId = @userId ORDER BY c.updatedAt DESC";
        parameters = [{ name: "@userId", value: userId }];
      }

      const { resources } = await complaints()
        .items.query({ query, parameters }, { partitionKey: tenantId })
        .fetchAll();

      // Strip sensitive fields for employee view (they shouldn't see other complainant names)
      // For ICC, return full records
      const sanitized = role === "icc"
        ? resources.map(addSasToEvidenceUrls)
        : resources.map(stripInternalFields).map(addSasToEvidenceUrls);

      return new Response(
        JSON.stringify({ complaints: sanitized, count: sanitized.length }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ) as unknown as HttpResponse;
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Failed to query complaints", details: (err as Error).message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      ) as unknown as HttpResponse;
    }
  },
});

/**
 * Remove internal/system fields from complaint before returning to employee.
 */
function stripInternalFields(complaint: Record<string, unknown>): Record<string, unknown> {
  const { _rid, _self, _etag, _attachments, _ts, ...rest } = complaint;
  return rest;
}
