# Architecture

> This document is the technical deep-dive for developers and solution architects evaluating Rakshak. For the high-level overview, see the [README](../README.md). For setup instructions, see the [Setup Guide](SETUP.md).

---

## Design Principles

| Principle | How it's applied |
|---|---|
| **Privacy by default** | Bot operates in personal scope only. Sensitive fields are encrypted at the application layer. Audit logs never contain complaint content — only IDs and actions. |
| **Fail toward the employee** | If the system fails silently (orchestration lost, Function App crashes), the daily safety-net cron catches it and re-starts escalation. Complaints are never lost or forgotten. |
| **Config over code** | Escalation timing, notification templates, reminder schedules, and channel routing are all driven by `orchestration.config.json`. No code changes needed for policy adjustments. |
| **Compliance is structural** | The 90-day inquiry deadline, multi-level escalation, and immutable audit log aren't features the ICC can disable — they're baked into the architecture. |

---

## System Overview

Rakshak has three runtime components that work together:

```
┌──────────────────────────────────────────────────────────────────┐
│                        Microsoft Teams                           │
│                                                                  │
│   ┌─────────────────────┐       ┌─────────────────────────────┐  │
│   │   Bot (Personal)    │       │     Tab (Dashboard)         │  │
│   │   1:1 private chat  │       │     React SPA               │  │
│   └──────────┬──────────┘       └──────────────┬──────────────┘  │
└──────────────┼──────────────────────────────────┼────────────────┘
               │                                  │
               ▼                                  ▼
┌──────────────────────┐         ┌──────────────────────────────┐
│    Bot Server        │         │    Azure Functions API       │
│    (Node.js + TS)    │         │    (v4 programming model)    │
│                      │         │                              │
│  • Conversation      │         │  • 9 HTTP triggers           │
│    router            │         │  • 3 Durable orchestrators   │
│  • LLM service       │────────▶│  • 5 activity functions      │
│  • Complaint CRUD    │         │  • Notification dispatcher   │
│  • Evidence upload   │         │  • Orchestration config      │
│  • Adaptive Cards    │         │                              │
└──────────┬───────────┘         └──────────────┬───────────────┘
           │                                    │
           ▼                                    ▼
┌──────────────────────────────────────────────────────────────────┐
│                        Azure Services                            │
│                                                                  │
│   ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│   │  Cosmos DB   │  │ Blob Storage │  │   Azure OpenAI        │  │
│   │  6 containers│  │ Evidence     │  │   GPT-4o (Responses   │  │
│   │              │  │ files        │  │   API, store: true)   │  │
│   └──────────────┘  └──────────────┘  └───────────────────────┘  │
│                                                                  │
│   ┌──────────────────────────────────────────────────────────┐   │
│   │  Microsoft Graph API (email) + Bot Framework (proactive) │   │
│   └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### Why Three Components?

| Component | Why it exists |
|---|---|
| **Bot Server** | Handles real-time Teams messaging. Runs the LLM conversation. Needs to be always-on and low-latency for streaming responses. |
| **Azure Functions API** | Stateful orchestrations (Durable Functions) need the Azure Functions runtime. HTTP triggers serve the tab frontend. Scales independently from the bot. |
| **Tab Frontend** | ICC members need a dashboard — you can't manage 50 complaints through bot chat. Employees need a status tracker. A React SPA in a Teams tab is the right UX. |

---

## Bot Server

### Entry Point

`index.ts` → creates the HTTP server and Bot Framework adapter. `src/app.ts` → registers the `TeamsActivityHandler` with message and card action handlers.

### Conversation Flow

```
User sends message
  │
  ▼
app.ts (TeamsActivityHandler)
  │ extracts text, attachments, card action data
  │
  ▼
router.ts (handleMessage / handleCardAction)
  │ loads conversation state from Cosmos DB
  │ routes to the correct flow based on state
  │
  ├─ state: "welcome" → welcomeFlow.ts
  │    Shows the welcome Adaptive Card
  │
  └─ state: "listening" → listeningFlow.ts
       Sends message to LLM with conversation history
       Streams response back to Teams
       Handles tool calls (update_complaint, submit_complaint)
       Handles evidence attachments
       Shows review card when LLM determines complaint is complete
```

### LLM Service (`src/services/llm/`)

Uses the OpenAI Responses API with two key features:

1. **`store: true`** — Tells OpenAI to retain the conversation server-side
2. **`previous_response_id`** — Chains turns without resending full history

This eliminates token bloat as conversations get long. The bot sends only the latest user message + the previous response ID. If the stored response expires, it falls back to sending full message history.

The LLM has two tool definitions:

| Tool | What it does |
|---|---|
| `update_complaint` | Updates complaint fields (incident date, location, accused, etc.) as the LLM extracts them from conversation |
| `submit_complaint` | Finalizes the complaint — called when the LLM determines all required info is collected and the user confirms |

### System Prompt

The system prompt in `src/services/llm/prompts.ts` contains:

- Complete POSH Act knowledge (Sections 2, 3, 4, 9, 11, 13, 19, 26)
- BNS criminal threshold indicators (Sections 74–79)
- Conversation rules: one question at a time, empathetic tone, acknowledge before asking, offer breaks
- Tool usage instructions
- Privacy guarantees

This is NOT RAG — the legal text is baked into the prompt because it's fixed and must be 100% accurate.

### Streaming

The bot uses Teams streaming (`context.stream.emit` / `context.stream.update` / `context.stream.close`) to show LLM responses as they generate. Critical: all error and refusal paths must close the stream to prevent stuck "Thinking..." indicators.

---

## Azure Functions API

### HTTP Triggers

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/health` | GET | Health check with Cosmos ping |
| `/api/complaints/submit` | POST | Accept complaint ID, start Durable orchestration |
| `/api/complaints` | GET | List complaints (employee sees own, ICC sees all for tenant) |
| `/api/complaints/{id}` | GET | Single complaint with full timeline. Evidence URLs get SAS tokens. |
| `/api/complaints/{id}/status` | PATCH | ICC updates status. Raises Durable Function external events. |
| `/api/complaints/{id}/comments` | GET/POST | Read/write comments on a complaint |
| `/api/complaints/{id}/evidence` | POST | Multipart file upload → Blob Storage → link to complaint |
| `/api/icc/dashboard` | GET | Aggregated ICC dashboard data |
| `/api/user/role` | GET | Returns user's role (employee/icc/admin) based on iccConfig |

### Durable Function Orchestrators

These are the heart of the escalation system. See [ESCALATION.md](ESCALATION.md) for the full breakdown.

**`complaintLifecycle`** — The main orchestrator. Started when a complaint is submitted. Runs for the entire life of the complaint (potentially months). Orchestrates notification → wait for acknowledgement → inquiry monitoring → resolution.

**`escalationChain`** — Sub-orchestrator. Multi-level escalation with durable timers. Checks complaint status at each step for self-termination. Config-driven levels and timing.

**`inquiryDeadline`** — Sub-orchestrator. Monitors the 90-day statutory inquiry deadline with configurable reminder intervals.

### Activity Functions

| Activity | Purpose |
|---|---|
| `fetchComplaint` | Read complaint from Cosmos for orchestration context |
| `sendNotification` | Unified notification dispatcher → email, proactive bot, activity feed |
| `logAudit` | Write immutable audit log entry |
| `updateStatus` | Update complaint status in Cosmos (optimistic concurrency) |
| `checkComplaintStatus` | Check if complaint has been acknowledged/resolved (for self-termination) |

### Notification Architecture

All notifications flow through a single path:

```
Orchestrator
  → sendNotification activity (notificationKey: "complaint_submitted")
    → notificationDispatcher
      → loads definition from orchestration.config.json
      → resolves audience (ICC members, escalation contacts, complainant)
      → renders templates with complaint data
      → dispatches to enabled channels:
          ├── graphEmailSender.ts   (Microsoft Graph API)
          ├── Bot proactive msg     (POST /api/proactive)
          └── activityFeedSender.ts (Teams activity feed)
```

### Orchestration Config

`api/src/orchestration.config.json` drives all orchestration behavior — escalation levels, timing, notification templates, reminder schedules, channel configuration. Changing the escalation timeline or adding notification channels requires only config changes, no code.

---

## Tab Frontend

React 18 SPA rendered as a Teams personal tab.

### Tech choices

| Library | Why |
|---|---|
| **Tailwind CSS v4** | Utility-first styling, rapid iteration |
| **Fluent UI v9** | Native Teams look for specific components |
| **Framer Motion** | Smooth animations for complaint cards, comments |
| **React Router** | Client-side routing between pages |
| **Microsoft Teams JS SDK** | Teams context, SSO token acquisition |

### Pages

| Page | Route | Who sees it |
|---|---|---|
| `EmployeeDashboard` | `/` | Employees — "My Complaints" list with status badges |
| `ComplaintDetail` | `/complaint/:id` | Employees — timeline, evidence, comments, PDF export |
| `IccDashboard` | `/icc` | ICC members — all complaints, filters, bulk actions |
| `IccCaseView` | `/icc/case/:id` | ICC — single case detail, acknowledge, respond, comment |

### Role-Based Routing

The tab calls `GET /api/user/role` on load. Based on the response:
- **employee** → routes to `EmployeeDashboard`
- **icc** / **admin** → routes to `IccDashboard`

---

## Database Design

### Multi-Tenant Isolation

All containers are partitioned by `tenantId` (Azure AD tenant). Data for different organizations is physically separated by partition key. ICC members can only query complaints within their tenant.

### Encryption

Sensitive complaint fields (description, names, locations) are encrypted at the application layer before writing to Cosmos. Even database administrators cannot read complaint content without the application's encryption key.

### Optimistic Concurrency

Complaint updates use Cosmos DB's ETag-based optimistic concurrency. If two concurrent updates conflict, one gets a 409 and must retry. This prevents lost updates when the ICC and the orchestrator both update a complaint simultaneously.

### Audit Log Immutability

The `auditLogs` container has no TTL and the application layer only performs `create` operations — never `update` or `delete`. This produces a legally admissible, tamper-evident record of every action in the complaint lifecycle.

---

## Security Model

### Bot Scope

The bot operates in **personal scope only** — 1:1 private conversations. It is never installed in group chats or channels. Complaint conversations are visible only to the employee and the bot.

### Evidence Files

Evidence is uploaded to Azure Blob Storage in a private container. Access URLs use time-limited SAS tokens (1 hour expiry) generated on demand. Raw blob URLs are never exposed to the frontend.

### SSRF Protection

Evidence download URLs from Teams (Adaptive Card action data) are validated against an allowlist of Microsoft domains before the bot fetches them. This prevents server-side request forgery via tampered card actions.

### API Authentication

API endpoints validate the caller's identity. Employee endpoints filter to the caller's own complaints. ICC endpoints verify membership in the iccConfig container.

---

## Key Design Decisions

| Decision | Why |
|---|---|
| **Durable Functions over Timer Triggers** | Complaint lifecycles span months. Durable orchestrators checkpoint state, survive restarts, and support durable timers that wait days without consuming resources. |
| **Sub-orchestrators over monolith** | Escalation chain and inquiry deadline are independent workflows — testable, retriable, and cancellable separately. |
| **External events over polling** | ICC acknowledgement triggers come via HTTP → `raiseEvent()`. Event-driven and instant. |
| **System prompt over RAG** | Legal text is fixed and small. RAG adds latency and retrieval errors for no benefit. |
| **`previous_response_id` over resending history** | OpenAI stores conversation state server-side. Eliminates token bloat as conversations grow. |
| **Unified `sendNotification`** | One config-driven dispatcher instead of many specialized activities. Adding channels = config change, not code. |
| **Client-side PDF** | Avoids Puppeteer in Azure Functions (cold start nightmare). Tab's "Export as PDF" is simpler for MVP. |
| **Cosmos DB over PostgreSQL** | Schemaless fits evolving complaint structures. Partition by tenantId for multi-tenant isolation. Azure-native. |

---

## Regulatory Compliance Matrix

How Rakshak's architecture maps to statutory requirements:

| Statutory Requirement | Section | How Rakshak Implements It |
|---|---|---|
| ICC must acknowledge complaints within a reasonable timeframe | POSH Act, S.9 | `acknowledgeDeadline` is auto-set on submission. Escalation chain begins if missed. |
| Inquiry must complete within 90 days | POSH Act, S.11 | `inquiryDeadline` orchestrator monitors with reminders at configurable intervals. Breach triggers escalation. |
| Annual report to District Officer | POSH Act, S.21 | Complaint data is queryable by date range, status, and outcome. Annual report orchestrator (roadmap) will auto-generate. |
| Employer must provide safe environment | POSH Act, S.19 | Anonymous, private 1:1 bot conversation. No HR visibility into complaint content. |
| Penalties for non-compliance (₹50,000, repeat = license cancellation) | POSH Act, S.26 | Immutable audit trail proves the system was actively monitoring. `escalation_check_passed` log entries demonstrate ongoing compliance. |
| Vigil mechanism for listed companies | Companies Act, S.177(9-10) | Escalation to Audit Committee is built into the escalation chain (Level 1). Whistleblower protection by design. |
| Board's Report must disclose POSH complaint data | Companies Rules 2025 | All complaint data (received, resolved, pending > 90 days) is queryable from Cosmos DB. |
| Criminal offences must be reported | BNS 2023, S.74-79 | LLM detects criminal threshold indicators during intake. `criminal_threshold_alert` fires before the escalation chain starts. |
| Consent before collecting personal data | DPDPA 2023 | Welcome card includes consent notice. `consentTimestamp` is recorded in the conversation record. |
| Purpose limitation and data minimization | DPDPA 2023 | Data is collected only for complaint processing. Encrypted at the field level. Scope-based API access ensures minimum necessary disclosure. |
| Right to erasure | DPDPA 2023 | Architecture supports complaint deletion on request. Audit logs are retained (legal obligation) but complaint content can be purged. |
