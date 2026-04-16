# Setup Guide

Step-by-step instructions to get Rakshak running locally on your machine.

## Prerequisites

| Requirement | Version | Purpose |
|---|---|---|
| **Node.js** | 20 or 22 | Runtime for bot, API, and tab |
| **npm** | 10+ | Package management |
| **VS Code** | Latest | IDE with Agents Toolkit extension |
| **Microsoft 365 Agents Toolkit** | v5.0+ | Teams app scaffolding, local debug, provisioning |
| **Azure CLI** | Latest | (Optional) For manual Azure resource management |
| **Azure Functions Core Tools** | v4 | Run Azure Functions locally |

### Azure Resources

You need an Azure subscription with the following resources provisioned:

| Resource | SKU | Notes |
|---|---|---|
| **Azure OpenAI** | Standard | Deploy a `gpt-4o` model |
| **Azure Cosmos DB** | Serverless (NoSQL) | Core SQL API |
| **Azure Blob Storage** | Standard LRS | For evidence file uploads |
| **Azure Bot Service** | (Provisioned by Agents Toolkit) | Multi-tenant bot registration |

### Microsoft 365

- A Microsoft 365 developer tenant or sandbox environment
- Admin consent for the bot app registration
- Sideloading enabled for the tenant

---

## 1. Clone the Repository

```bash
git clone https://github.com/mohit67890/rakshak.git
cd rakshak
```

## 2. Install Dependencies

Three separate `node_modules` — root (bot), API, and tab:

```bash
npm install
cd api && npm install && cd ..
cd tab && npm install && cd ..
```

## 3. Configure Environment Variables

### For local Teams debugging

Copy the example templates and fill in your real credentials:

```bash
cp env/.env.dev.example env/.env.dev
cp env/.env.playground.example env/.env.playground
cp api/local.settings.example.json api/local.settings.json
```

Edit `env/.env.dev` with your values:

```env
# Teams App
TEAMSFX_ENV=local
APP_NAME_SUFFIX=(local)

# Azure OpenAI
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_API_KEY=your-key-here
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4o

# Cosmos DB
COSMOS_ENDPOINT=https://your-cosmos.documents.azure.com:443/
COSMOS_KEY=your-cosmos-key
COSMOS_DATABASE=raksha-db

# Bot (populated by Agents Toolkit on first F5)
BOT_ID=
TEAMS_APP_ID=
BOT_DOMAIN=
BOT_ENDPOINT=
```

### For Azure Functions (API)

The `api/local.settings.json` was created from the example template above. Edit it with your values:

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "COSMOS_ENDPOINT": "https://your-cosmos-account.documents.azure.com:443/",
    "COSMOS_KEY": "your-cosmos-db-primary-key",
    "COSMOS_DATABASE": "raksha-db",
    "STORAGE_CONNECTION_STRING": "UseDevelopmentStorage=true",
    "STORAGE_CONTAINER_COMPLAINTS": "raksha-storage",
    "GRAPH_CLIENT_ID": "your-graph-app-client-id",
    "GRAPH_CLIENT_SECRET": "your-graph-app-client-secret",
    "GRAPH_TENANT_ID": "your-azure-ad-tenant-id",
    "GRAPH_SENDER_EMAIL": "noreply@yourdomain.onmicrosoft.com",
    "DEFAULT_ACKNOWLEDGE_DEADLINE_DAYS": "7",
    "DEFAULT_INQUIRY_DEADLINE_DAYS": "90"
  }
}
```

> **Note:** `UseDevelopmentStorage=true` points to Azurite for local Blob Storage and Durable Functions state. You need Azurite running (see step 5).

## 4. Set Up the Database

Run the database setup script to create the Cosmos DB database and all containers:

```bash
cd scripts
node setup-cosmos.mjs
```

This creates:

| Container | Partition Key | Purpose |
|---|---|---|
| `complaints` | `/tenantId` | Complaint records |
| `conversations` | `/visitorId` | Bot conversation state |
| `messages` | `/visitorId` | Message history |
| `auditLogs` | `/tenantId` | Immutable audit trail |
| `iccConfig` | `/tenantId` | ICC member configuration |
| `comments` | `/complaintId` | Complaint comments |

## 5. Start Azurite (Local Azure Storage)

Azurite emulates Azure Blob Storage and Table Storage locally. Required for:
- Durable Functions orchestration state
- Evidence file uploads

```bash
# From the repo root
mkdir -p .azurite
npx azurite --silent --location .azurite &
```

Azurite runs on:
- Blob: `localhost:10000`
- Queue: `localhost:10001`
- Table: `localhost:10002`

## 6. Start the Application

### Option A: Teams with Agents Toolkit (Recommended)

1. Open the repo in VS Code
2. Ensure the Microsoft 365 Agents Toolkit extension is installed
3. Press **F5** or select **Start App Locally** from the debug panel
4. The toolkit will:
   - Validate prerequisites
   - Start a dev tunnel for the bot endpoint
   - Provision the bot registration
   - Deploy the app manifest
   - Launch Teams in the browser with the app sideloaded

### Option B: Agents Playground (No Teams Required)

For quick iteration without a full Teams environment:

```bash
# Terminal 1: Start the bot
npm run dev:teamsfx:playground

# Terminal 2: Start the playground UI
npm run dev:teamsfx:launch-playground
```

### Start the API Separately

The Azure Functions API runs independently:

```bash
cd api
func start
```

The API starts on `http://localhost:7071` with all HTTP triggers, orchestrators, and activities.

### Start the Tab Dev Server (Optional)

If you're working on the dashboard tab independently:

```bash
cd tab
npm run dev
```

The Vite dev server starts on `http://localhost:53000`.

## 7. Verify Everything Works

### Bot

1. Open the bot in Teams or Playground
2. Send "Hi" — you should see the welcome card with three action buttons
3. Click "I need to report something" — the bot should start the intake conversation

### API

```bash
# Health check
curl http://localhost:7071/api/health

# Expected: { "status": "ok", ... }
```

### Database

```bash
# Verify containers exist
cd scripts
node setup-cosmos.mjs
# Should show "already exists" for each container
```

## 8. Run Tests

```bash
# From repo root
npm test
```

Expected: 4 test suites, 159 tests passing.

| Suite | Description |
|---|---|
| `e2e.test.ts` | Full conversation lifecycle (mocked DB + LLM) |
| `api.test.ts` | HTTP triggers + activities + orchestrator logic |
| `orchestration.test.ts` | Config validation + notification templates |
| `api.integration.test.ts` | Real Cosmos DB operations (skipped if no connection) |

---

## Troubleshooting

### "Cannot find module" errors

Make sure you installed dependencies in all three directories:
```bash
npm install && cd api && npm install && cd ../tab && npm install && cd ..
```

### Azurite connection refused

Ensure Azurite is running before starting the API:
```bash
npx azurite --silent --location .azurite &
```

### Bot not responding in Teams

- Check the dev tunnel is running (visible in VS Code terminal tabs)
- Verify `BOT_ENDPOINT` in your env file points to the tunnel URL
- Check the bot server terminal for errors

### Cosmos DB "Resource Not Found"

Run the setup script to create missing containers:
```bash
cd scripts && node setup-cosmos.mjs
```

### Azure Functions won't start

- Verify Azure Functions Core Tools v4 is installed: `func --version`
- Ensure `api/local.settings.json` has valid Cosmos credentials
- Ensure Azurite is running (needed for `AzureWebJobsStorage`)

### LLM not responding

- Verify your Azure OpenAI endpoint, key, and deployment name
- Check that the deployment is a GPT-4o model (not GPT-3.5)
- Check the bot server logs for OpenAI API errors
