/**
 * Raksha API — HTTP Trigger: Health Check
 *
 * GET /api/health
 *
 * Simple health check endpoint. Returns 200 if the Functions host is running.
 * Optionally checks Cosmos DB connectivity.
 */

import { app, type HttpRequest, type HttpResponse, type InvocationContext } from "@azure/functions";
import { complaints } from "../../shared/cosmosClient";

app.http("healthCheck", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "health",
  handler: async (_req: HttpRequest, context: InvocationContext): Promise<HttpResponse> => {
    const health: Record<string, unknown> = {
      status: "ok",
      service: "raksha-api",
      timestamp: new Date().toISOString(),
    };

    // Optional: check Cosmos connectivity
    try {
      // A lightweight query to verify the connection
      await complaints().items.query("SELECT VALUE 1").fetchAll();
      health.cosmos = "connected";
    } catch (err) {
      health.cosmos = "disconnected";
      health.cosmosError = err instanceof Error ? err.message : "Unknown error";
      context.warn("[raksha-api] Health check: Cosmos DB unreachable");
    }

    return new Response(JSON.stringify(health), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }) as unknown as HttpResponse;
  },
});
