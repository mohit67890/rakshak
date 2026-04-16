/**
 * Raksha API — HTTP Trigger: ICC Dashboard
 *
 * GET /api/icc/dashboard?tenantId={tenantId}&userId={userId}
 *
 * Returns dashboard data for ICC members:
 *   - Summary counts by status
 *   - Recent complaints
 *   - Overdue complaints (past acknowledgement deadline)
 *   - Complaints with breached inquiry deadline
 *
 * TODO: Replace query params with Entra ID token claims once auth middleware is added.
 * TODO: Verify userId is an ICC member for the given tenant.
 */

import { app, type HttpRequest, type HttpResponse, type InvocationContext } from "@azure/functions";
import { complaints } from "../../shared/cosmosClient";

app.http("getIccDashboard", {
  methods: ["GET"],
  authLevel: "anonymous", // TODO: Add Entra ID token validation
  route: "icc/dashboard",
  handler: async (req: HttpRequest, _context: InvocationContext): Promise<HttpResponse> => {
    const tenantId = req.query.get("tenantId");
    const userId = req.query.get("userId");

    if (!tenantId || !userId) {
      return new Response(
        JSON.stringify({ error: "tenantId and userId are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ) as unknown as HttpResponse;
    }

    try {
      // Get all non-draft complaints for this tenant
      const { resources: allComplaints } = await complaints()
        .items.query(
          { query: "SELECT * FROM c WHERE c.status != 'draft' ORDER BY c.updatedAt DESC" },
          { partitionKey: tenantId },
        )
        .fetchAll();

      const now = new Date();

      // Compute summary counts
      const summary = {
        total: allComplaints.length,
        submitted: 0,
        under_inquiry: 0,
        resolved: 0,
        escalated: 0,
        closed: 0,
      };

      const overdue: typeof allComplaints = [];
      const inquiryBreached: typeof allComplaints = [];
      const recent: typeof allComplaints = [];

      for (const c of allComplaints) {
        // Count by status
        if (c.status in summary) {
          (summary as Record<string, number>)[c.status] += 1;
        }

        // Overdue: submitted but past acknowledgement deadline
        if (
          c.status === "submitted" &&
          c.acknowledgeDeadline &&
          new Date(c.acknowledgeDeadline) < now
        ) {
          overdue.push(c);
        }

        // Inquiry breached: under_inquiry but past 90-day deadline
        if (
          c.status === "under_inquiry" &&
          c.inquiryDeadline &&
          new Date(c.inquiryDeadline) < now
        ) {
          inquiryBreached.push(c);
        }
      }

      // Recent: last 10 updated
      recent.push(...allComplaints.slice(0, 10));

      // Strip Cosmos internal fields
      const clean = (items: Record<string, unknown>[]) =>
        items.map(({ _rid, _self, _etag, _attachments, _ts, ...rest }) => rest);

      return new Response(
        JSON.stringify({
          summary,
          recent: clean(recent),
          overdue: clean(overdue),
          inquiryBreached: clean(inquiryBreached),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ) as unknown as HttpResponse;
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Failed to load dashboard", details: (err as Error).message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      ) as unknown as HttpResponse;
    }
  },
});
