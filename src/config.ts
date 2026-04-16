/**
 * Raksha — Configuration
 *
 * Loads and validates environment variables.
 * For orchestration behavior (escalation, reminders, deadlines, notifications),
 * see api/src/orchestration.config.json — loaded via orchestrationConfig.
 */

import orchestrationConfig from "../api/src/shared/orchestrationConfig";

const config = {
  // Azure Bot / Teams
  MicrosoftAppId: process.env.CLIENT_ID,
  MicrosoftAppType: process.env.BOT_TYPE,
  MicrosoftAppTenantId: process.env.TENANT_ID,
  MicrosoftAppPassword: process.env.CLIENT_PASSWORD,

  // Azure OpenAI (OpenAI-compatible endpoint)
  azureOpenAI: {
    baseURL: process.env.AZURE_OPENAI_ENDPOINT || "",
    apiKey: process.env.AZURE_OPENAI_API_KEY || "",
    deploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || "gpt-5.4-mini",
  },

  // Cosmos DB (Step 2)
  cosmos: {
    endpoint: process.env.COSMOS_ENDPOINT || "",
    key: process.env.COSMOS_KEY || "",
    database: process.env.COSMOS_DATABASE || "raksha-db",
  },

  // Azure Blob Storage (Phase 2)
  storage: {
    connectionString: process.env.STORAGE_CONNECTION_STRING || "",
    complaintsContainer: process.env.STORAGE_CONTAINER_COMPLAINTS || "complaint-pdfs",
    evidenceContainer: process.env.STORAGE_CONTAINER_EVIDENCE || "evidence-files",
  },

  /** Orchestration settings — sourced from orchestration.config.json */
  orchestration: orchestrationConfig,

  // Raksha API (Azure Functions)
  api: {
    baseUrl: process.env.API_BASE_URL || "http://localhost:7071",
  },
};

export default config;
