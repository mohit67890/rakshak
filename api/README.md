# Raksha API — Azure Functions Backend

Serverless API that powers complaint lifecycle orchestration, notification dispatch, and ICC management for the Raksha workplace safety bot.

Built with **Azure Functions v4** (Node.js, TypeScript) and **Azure Durable Functions v3** for stateful, long-running workflows that survive restarts and can wait days/weeks between steps.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Raksha API                                │
│                                                                  │
│  ┌──────────────┐   ┌──────────────────┐   ┌─────────────────┐  │
│  │ HTTP Triggers │   │   Orchestrators  │   │   Activities    │  │
│  │              │──▶│   (Durable)      │──▶│  (Units of work)│  │
│  │ submitComp.  │   │                  │   │                 │  │
│  │ updateStatus │   │ complaintLife-   │   │ generatePdf     │  │
│  │ healthCheck  │   │ cycle            │   │ uploadToBlob    │  │
│  └──────────────┘   │                  │   │ updateStatus    │  │
│                     │ (escalationChain)│   │ logAudit        │  │
│                     │ (inquiryDeadline)│   │ sendNotification│  │
│                     └──────────────────┘   │ sendIccNotif.   │  │
│                                            │ notifyComplain. │  │
│  ┌───────────────────────────────────────┐ └─────────────────┘  │
│  │           Shared Services             │                       │
│  │ orchestrationConfig  cosmosClient     │                       │
│  │ graphEmailSender     notifDispatcher  │                       │
│  │ config               types            │                       │
│  └───────────────────────────────────────┘                       │
└──────────────────────────────────────────────────────────────────┘
         │                    │                       │
         ▼                    ▼                       ▼
   Azure Cosmos DB     Azure Blob Storage     Microsoft Graph API
   (complaints,       (complaint PDFs,        (email via sendMail,
    auditLogs,         evidence files)         future: activity
    iccConfig)                                 feed notifications)
```

## Project Structure

```
api/
├── host.json                           # Azure Functions + Durable Task config
├── local.settings.json                 # Local dev environment variables
├── package.json                        # Dependencies (Functions SDK, Durable, Cosmos, Identity)
├── tsconfig.json                       # TypeScript config
│
└── src/
    ├── index.ts                        # Entry point — imports all function modules
    │
    ├── orchestration.config.json       # Single source of truth for all orchestration behavior
    │                                   #   Escalation chains, reminders, deadlines,
    │                                   #   notification routing, templates — all config-driven
    │
    ├── functions/
    │   ├── httpTriggers/
    │   │   ├── healthCheck.ts          # GET /api/health — Cosmos connectivity check
    │   │   ├── submitComplaint.ts      # POST /api/complaints/:id/submit — starts lifecycle orchestration
    │   │   └── updateComplaintStatus.ts# PATCH /api/complaints/:id/status — ICC acknowledges/resolves
    │   │
    │   ├── orchestrators/
    │   │   └── complaintLifecycle.ts   # Main Durable orchestrator: submit → notify → wait for ack → resolve
    │   │                               # (escalationChain and inquiryDeadline sub-orchestrators planned)
    │   │
    │   └── activities/
    │       ├── generatePdf.ts          # Generate complaint PDF (stub — pdf-lib integration planned)
    │       ├── uploadToBlob.ts         # Upload PDF/evidence to Azure Blob Storage (stub)
    │       ├── updateStatus.ts         # Update complaint status + version in Cosmos DB
    │       ├── logAudit.ts             # Write immutable audit log entry to Cosmos DB
    │       ├── sendNotification.ts     # Unified notification — dispatches via config-driven routing
    │       ├── sendIccNotification.ts  # Legacy ICC email stub (being replaced by sendNotification)
    │       └── notifyComplainant.ts    # Legacy complainant stub (being replaced by sendNotification)
    │
    └── shared/
        ├── config.ts                   # Environment variable loader (Cosmos, Graph, Storage)
        ├── cosmosClient.ts             # Cosmos DB connection — complaints, auditLogs, iccConfig containers
        ├── types.ts                    # TypeScript interfaces for Complaint, AuditLog, activity inputs
        ├── orchestrationConfig.ts      # Typed schema + validation + template engine for orchestration.config.json
        ├── graphEmailSender.ts         # Microsoft Graph sendMail — app-only auth via ClientSecretCredential
        └── notificationDispatcher.ts   # Audience resolver + template renderer + multi-channel dispatcher
```

## How Orchestration Works

All orchestration behavior is driven by [`orchestration.config.json`](src/orchestration.config.json) — a single JSON file that controls deadlines, escalation chains, reminder schedules, and notification routing. No hardcoded values.

### Complaint Lifecycle

When an employee submits a complaint through the bot, the bot saves it to Cosmos DB and calls `POST /api/complaints/:id/submit`. This starts the **complaintLifecycle** Durable orchestrator:

```
SUBMITTED
  ├── Activity: generatePdf
  ├── Activity: uploadToBlob
  ├── Activity: sendNotification("complaint_submitted")  →  ICC gets email, complainant gets bot message
  ├── Activity: logAudit("submitted")
  │
  ├── Wait for external event: "complaint_acknowledged"
  │   (ICC clicks "Acknowledge" in Tab UI → PATCH /api/complaints/:id/status → raises event)
  │
  ├── Activity: updateStatus("acknowledged")
  ├── Activity: sendNotification("complaint_acknowledged")
  ├── Activity: logAudit("acknowledged")
  │
  ├── Wait for external event: "complaint_resolved"
  │
  └── Activity: updateStatus("resolved") + logAudit("resolved")
```

### Escalation (Dead Man's Switch)

If the ICC doesn't acknowledge within the configured deadline (default: 7 days), the escalation chain fires automatically:

| Level | Wait | Action | Who Gets Notified |
|---|---|---|---|
| 0 — ICC Reminder | 0 days after deadline | Nudge ICC | ICC Presiding Officer + all members (email) |
| 1 — Audit Committee | +3 days | Escalate | Audit Committee (email) + ICC PO (email) + complainant (bot) |
| 2 — District Officer | +7 days | Final escalation | District Officer + Nodal Officer + ICC PO (email) + complainant (bot) |

Total: if nobody acts, the complaint reaches the District Officer in **17 days** (7 + 0 + 3 + 7).

### Inquiry Deadline (90 Days)

Once acknowledged, the POSH Act mandates a 90-day inquiry window. The system sends automatic reminders:

| Day | Urgency | Recipients |
|---|---|---|
| 60 | Normal | ICC Presiding Officer |
| 75 | Normal | ICC Presiding Officer |
| 85 | High | ICC Presiding Officer + all members |
| 89 | Critical | ICC Presiding Officer + all members |
| 90 (breach) | — | Complainant (bot) + Audit Committee (email) |

## Notification System

### Channels

| Channel | Implementation | Status |
|---|---|---|
| **email** | Microsoft Graph API `POST /users/{sender}/sendMail` with `ClientSecretCredential` | ✅ Implemented |
| **bot** | Proactive message via bot's `/api/proactive` endpoint | 🔲 Stub (logs to console) |
| **teams_activity** | Graph API `TeamsActivity.Send` — Activity feed bell notification | 🔲 Disabled (opt-in future) |

### How Notifications Are Dispatched

```
Orchestrator calls activity "sendNotification"
    input: { notificationKey: "complaint_submitted", tenantId, templateVars, complainant? }
         │
         ▼
  notificationDispatcher.ts
         │
         ├── 1. Load notification definition from orchestration.config.json
         │       → recipients: [{ audience: "icc_presiding_officer", channel: "email" }, ...]
         │       → templates:  { "icc_presiding_officer": { subject: "...", body: "..." } }
         │
         ├── 2. Load tenant's iccConfig from Cosmos DB
         │       → resolves "icc_presiding_officer" → { name: "Priya Sharma", email: "priya@acme.com" }
         │       → resolves "icc_all_members" → 3 active members
         │       → resolves "escalation_contacts_level_1" → 2 audit committee contacts
         │
         ├── 3. Render templates with variable substitution
         │       → "Complaint {{complaintNumber}} has..." → "Complaint RKS-20260415-0001 has..."
         │
         ├── 4a. Email recipients → graphEmailSender.ts → Graph API sendMail
         ├── 4b. Bot recipients → HTTP POST to bot /api/proactive (planned)
         └── 4c. teams_activity recipients → Graph TeamsActivity.Send (planned)
```

### Audience Keys

The notification definitions use abstract audience keys. At runtime, they're resolved against the tenant's `iccConfig` document in Cosmos DB:

| Audience Key | Resolved From |
|---|---|
| `icc_presiding_officer` | `iccConfig.iccMembers` where `role === "presiding_officer"` and `isActive` |
| `icc_all_members` | `iccConfig.iccMembers` where `isActive` |
| `escalation_contacts_level_1` | `iccConfig.escalationContacts` where `level === 1` |
| `escalation_contacts_level_2` | `iccConfig.escalationContacts` where `level === 2` |
| `nodal_officer` | `iccConfig.settings.nodalOfficerEmail` |
| `complainant` | From the complaint record (passed as input to the activity) |

## Environment Variables

```env
# Azure Cosmos DB
COSMOS_ENDPOINT=https://your-cosmos.documents.azure.com:443/
COSMOS_KEY=your-cosmos-key
COSMOS_DATABASE=raksha-db

# Azure Blob Storage (also used by Durable Functions for orchestration state)
STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...
STORAGE_CONTAINER_COMPLAINTS=complaint-pdfs

# Microsoft Graph API (for email notifications)
GRAPH_CLIENT_ID=your-entra-app-id
GRAPH_CLIENT_SECRET=your-client-secret
GRAPH_TENANT_ID=your-tenant-id
GRAPH_SENDER_EMAIL=raksha@yourcompany.com    # Shared mailbox or service account

# Azure Functions
AzureWebJobsStorage=UseDevelopmentStorage=true    # Use Azurite for local dev
FUNCTIONS_WORKER_RUNTIME=node
```

### Entra App Permissions Required

| Permission | Type | Purpose |
|---|---|---|
| `Mail.Send` | Application | Send emails via Graph API without user sign-in |
| `TeamsActivity.Send` | Application | Activity feed notifications (future) |

## Local Development

### Prerequisites

- Node.js 20+
- [Azure Functions Core Tools](https://learn.microsoft.com/en-us/azure/azure-functions/functions-run-local) v4
- [Azurite](https://learn.microsoft.com/en-us/azure/storage/common/storage-use-azurite) (local storage emulator — required for Durable Functions state)

### Setup

```bash
# Install dependencies
cd api
npm install

# Start Azurite (required for Durable Functions)
azurite --silent --location .azurite --debug .azurite/debug.log

# Copy env vars
cp local.settings.json local.settings.json.bak
# Fill in COSMOS_ENDPOINT, COSMOS_KEY, GRAPH_* values

# Build and run
npm start
# → Functions runtime starts on http://localhost:7071
```

### Available Endpoints

| Method | URL | Description |
|---|---|---|
| `GET` | `/api/health` | Health check — verifies Cosmos DB connectivity |
| `POST` | `/api/complaints/:id/submit` | Start complaint lifecycle orchestration |
| `PATCH` | `/api/complaints/:id/status` | ICC acknowledges/resolves — raises external event to running orchestration |

### Testing Orchestrations Locally

Durable Functions exposes an HTTP API for managing orchestrations during development:

```bash
# Check orchestration status
curl http://localhost:7071/runtime/webhooks/durabletask/instances/{complaintId}

# Simulate ICC acknowledgement (raises external event)
curl -X POST http://localhost:7071/runtime/webhooks/durabletask/instances/{complaintId}/raiseEvent/complaint_acknowledged \
  -H "Content-Type: application/json" \
  -d '{"iccMemberId": "user-123", "timestamp": "2026-04-15T10:00:00Z"}'

# Fast-forward durable timers (for testing escalation without waiting days)
# Use the Durable Functions Monitor VS Code extension
```

## Testing

Tests live in the root `tests/` directory (shared with the bot):

```bash
# From project root
npx vitest run                          # All tests (152)
npx vitest run tests/api.test.ts        # API unit tests (33) — mocked Cosmos + Functions
npx vitest run tests/api.integration.test.ts  # Integration tests (17) — real Cosmos DB
npx vitest run tests/orchestration.test.ts    # Orchestration config + notification routing (79)
```

### Test Coverage

| Test File | Tests | What It Validates |
|---|---|---|
| `api.test.ts` | 33 | HTTP triggers, activity functions, orchestrator step-through (all mocked) |
| `api.integration.test.ts` | 17 | Real Cosmos DB CRUD, pipeline lifecycle, ICC acknowledgement flow |
| `orchestration.test.ts` | 79 | Config validation, escalation levels, inquiry reminders, all 13 notification definitions, template rendering, audience resolution against iccConfig, end-to-end escalation + inquiry walkthrough |

## Key Design Decisions

| Decision | Why |
|---|---|
| **Durable Functions over Timer Triggers** | Complaint lifecycles span weeks. Durable orchestrators checkpoint state, survive restarts, support timers that wait days, and handle conditional branching (ICC responds → cancel escalation). |
| **Config-driven notifications** | `orchestration.config.json` defines *what* happens and *who* gets notified. `iccConfig` in Cosmos defines *who those people are*. Changing notification behavior requires zero code changes. |
| **`sendNotification` as unified activity** | One activity handles email, bot, and future channels. The orchestrator just passes a notification key — the dispatcher resolves audiences, renders templates, and routes. |
| **Graph `sendMail` over SMTP** | Azure-native, uses the same Entra credentials as everything else. No SMTP relay needed. Works with shared mailboxes. |
| **Bot proactive via HTTP endpoint** | The API can't access the bot's adapter directly (different process). The API calls a `/api/proactive` endpoint on the bot, which uses `continueConversation()` to send messages. |
| **`teams_activity` disabled by default** | Requires `TeamsActivity.Send` permission and additional manifest config. Opt-in when ready. |
| **Instance ID = Complaint ID** | Durable orchestration instance IDs equal complaint UUIDs. This makes it trivial to raise events and query status for a specific complaint. |

## Dependencies

| Package | Version | Purpose |
|---|---|---|
| `@azure/functions` | ^4.6.0 | Azure Functions v4 programming model |
| `durable-functions` | ^3.1.0 | Durable orchestrators, activities, entities, timers |
| `@azure/cosmos` | ^4.2.0 | Cosmos DB SDK — complaints, auditLogs, iccConfig containers |
| `@azure/identity` | ^4.13.1 | `ClientSecretCredential` for Graph API app-only auth |
| `uuid` | ^11.1.0 | Generate unique IDs for audit log entries |

## Roadmap

- [x] HTTP triggers (healthCheck, submitComplaint, updateComplaintStatus)
- [x] Activity functions (generatePdf, uploadToBlob, updateStatus, logAudit)
- [x] Complaint lifecycle orchestrator (basic flow)
- [x] Orchestration config — single JSON driving all behavior
- [x] Notification dispatcher — audience resolution + template rendering + Graph email
- [ ] Escalation chain sub-orchestrator with durable timers
- [ ] Inquiry deadline sub-orchestrator (90-day monitoring + reminders)
- [ ] Complaint entity (per-complaint state tracker)
- [ ] Bot proactive messaging endpoint + conversation reference storage
- [ ] Real PDF generation via pdf-lib
- [ ] Criminal threshold detection activity
- [ ] Auth middleware (Entra ID token validation)
- [ ] Daily orchestration starter (timer trigger safety net)