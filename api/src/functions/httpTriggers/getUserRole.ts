/**
 * Raksha API — HTTP Trigger: Get User Role
 *
 * GET /api/me?tenantId={tenantId}&userId={userId}
 *
 * Returns the user's role (employee or icc) by checking if they exist
 * in the tenant's iccConfig.iccMembers list.
 *
 * This is the ONLY way the tab determines what view to show.
 * Employees never see ICC-specific UI.
 *
 * TODO: Replace query params with Entra ID token claims once auth is added.
 */

import { app, type HttpRequest, type HttpResponse, type InvocationContext } from "@azure/functions";
import { iccConfig } from "../../shared/cosmosClient";

app.http("getUserRole", {
  methods: ["GET"],
  authLevel: "anonymous", // TODO: Add Entra ID token validation
  route: "me",
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
      // Query iccConfig for this tenant
      const { resources } = await iccConfig()
        .items.query(
          { query: "SELECT * FROM c WHERE c.tenantId = @tenantId", parameters: [{ name: "@tenantId", value: tenantId }] },
          { partitionKey: tenantId },
        )
        .fetchAll();

      const config = resources[0];
      let role: "employee" | "icc" = "employee";
      let iccRole: string | null = null;

      if (config?.iccMembers) {
        const member = (config.iccMembers as Array<{ userId: string; role: string; isActive: boolean }>)
          .find((m) => m.userId === userId && m.isActive);
        if (member) {
          role = "icc";
          iccRole = member.role; // presiding_officer, member, external_member
        }
      }

      return new Response(
        JSON.stringify({ userId, tenantId, role, iccRole }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ) as unknown as HttpResponse;
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Failed to determine role", details: (err as Error).message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      ) as unknown as HttpResponse;
    }
  },
});
