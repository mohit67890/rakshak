/**
 * Raksha API — Configuration
 *
 * Environment variables for the Azure Functions API.
 * Reads from local.settings.json (dev) or App Settings (Azure).
 *
 * For orchestration behavior (escalation, reminders, deadlines, notifications),
 * see orchestration.config.json — loaded via orchestrationConfig.ts.
 */

import orchestrationConfig from "./orchestrationConfig";

const config = {
  cosmos: {
    endpoint: process.env.COSMOS_ENDPOINT || "",
    key: process.env.COSMOS_KEY || "",
    database: process.env.COSMOS_DATABASE || "raksha-db",
  },

  storage: {
    connectionString: process.env.STORAGE_CONNECTION_STRING || "",
    complaintsContainer: process.env.STORAGE_CONTAINER_COMPLAINTS || "complaint-pdfs",
    evidenceContainer: process.env.STORAGE_CONTAINER_EVIDENCE || "evidence-files",
  },

  graph: {
    clientId: process.env.GRAPH_CLIENT_ID || "",
    clientSecret: process.env.GRAPH_CLIENT_SECRET || "",
    tenantId: process.env.GRAPH_TENANT_ID || "",
    senderEmail: process.env.GRAPH_SENDER_EMAIL || "",
  },

  /** Orchestration settings — sourced from orchestration.config.json */
  orchestration: orchestrationConfig,
};

export default config;
