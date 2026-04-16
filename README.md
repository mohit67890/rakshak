<p align="center">
  <img src="rakshak_logo.png" alt="Rakshak Logo" width="160" />
</p>

<h1 align="center">Rakshak</h1>

<p align="center">
  <strong>रक्षक — "protector" in Sanskrit</strong><br>
  AI-powered POSH workplace safety bot for Microsoft Teams
</p>

<p align="center">
  <em>Because complaints shouldn't need courage.</em>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" /></a>
  <a href="#"><img src="https://img.shields.io/badge/node-20%2B-brightgreen.svg" alt="Node.js 20+" /></a>
  <a href="#"><img src="https://img.shields.io/badge/TypeScript-strict-blue.svg" alt="TypeScript Strict" /></a>
  <a href="#testing"><img src="https://img.shields.io/badge/tests-159%20passing-brightgreen.svg" alt="159 Tests Passing" /></a>
  <a href="#legal-framework"><img src="https://img.shields.io/badge/POSH%20Act-2013%20compliant-orange.svg" alt="POSH Act 2013" /></a>
  <a href="#legal-framework"><img src="https://img.shields.io/badge/DPDPA-2023%20ready-orange.svg" alt="DPDPA 2023" /></a>
</p>

<p align="center">
  <a href="#the-problem">The Problem</a> •
  <a href="#how-rakshak-solves-it">The Solution</a> •
  <a href="#security--compliance">Security</a> •
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#legal-framework">Legal Framework</a> •
  <a href="#contributing">Contributing</a>
</p>

---

## The Problem

> In a widely reported case (2026), multiple women at a major Indian IT company were harassed for years. The HR head suppressed complaints. The ICC never acted. The women eventually went to the police — not because the system worked, but because it didn't.

This isn't an isolated failure. Under the POSH Act (2013), every Indian organisation with 10+ employees must have an Internal Complaints Committee. Most do — on paper. But when complaints go through web forms and email IDs that route to the same HR department that may be compromised, the process fails at the first step.

**Every existing POSH compliance tool is an ICC-side dashboard.** It digitises the process for the committee — but leaves employees with forms that go to the same people who might be suppressing complaints.

## How Rakshak Solves It

Rakshak puts the power on the **employee side**:

| What happens today | What Rakshak does |
|---|---|
| Employee fills out a web form that goes to HR | Employee has a **private 1:1 bot conversation** in Teams — HR never sees it |
| Employee must know legal terminology to file | Bot asks empathetic questions in plain language and **auto-generates a legally structured complaint** citing specific POSH Act sections |
| ICC ignores the complaint — nothing happens | **Dead man's switch** auto-escalates: ICC → Audit Committee → District Officer. No human permission needed. |
| No audit trail if complaints are suppressed | **Immutable, append-only audit log** — every action timestamped, cannot be edited or deleted |
| Employee has no visibility into their case | **Real-time status tracking** via bot chat or Teams dashboard tab |
| 90-day inquiry deadline quietly passes | **Automated deadline monitoring** with reminders at 30, 15, 5, and 1 day — breach triggers escalation |

The system makes complaint suppression **structurally impossible**.

## Security & Compliance

Rakshak is designed for the most sensitive data an organisation handles — harassment complaints. Security isn't a feature; it's the foundation.

| Measure | Implementation |
|---|---|
| **Field-level encryption** | Complaint descriptions, names, and locations are encrypted at the application layer before reaching the database. Even database administrators cannot read complaint content. |
| **Private conversations only** | Bot operates exclusively in 1:1 personal scope. Never in group chats or channels. No one sees complaint conversations except the employee and the bot. |
| **Multi-tenant data isolation** | All Cosmos DB containers are partitioned by `tenantId`. Data for different organisations is physically separated. ICC members can only access complaints within their own tenant. |
| **Immutable audit trail** | Every action (submission, acknowledgement, escalation, resolution) is logged in an append-only audit store. No update or delete operations. Legally admissible, tamper-evident. |
| **Time-limited evidence access** | Evidence files in Azure Blob Storage use SAS tokens with 1-hour expiry. Raw blob URLs are never exposed. |
| **SSRF protection** | Evidence download URLs are validated against an allowlist of Microsoft domains before the bot fetches them. |
| **Scope-based API access** | Employees see only their own complaints. ICC members see only their tenant's complaints. Enforced at every API endpoint. |
| **DPDPA 2023 ready** | Consent collection, purpose limitation, data minimization, and right to erasure are implemented ahead of the May 2027 enforcement date. |

> **Reporting security issues:** If you find a vulnerability — especially related to complaint data exposure, auth bypass, or encryption — please **do not** open a public issue. Email **mohit@datapuls.ai** directly. We treat these with the highest urgency.

## Who Is Rakshak For?

| Audience | Why Rakshak |
|---|---|
| **Indian companies with 10+ employees** | The POSH Act (2013) mandates an ICC for every organisation with 10+ employees. Rakshak operationalises this requirement through Microsoft Teams — the platform your workforce already uses. |
| **Listed companies** | The Companies (Accounts) Rules 2025 require Board disclosure of POSH complaint data. Rakshak generates this automatically. Section 177 vigil mechanism compliance is built-in through the Audit Committee escalation. |
| **Organisations using Microsoft Teams** | Native Teams integration — bot + tab. No separate app to install, no new credentials. SSO via Microsoft Entra ID. |
| **CHROs and Compliance Officers** | Demonstrable compliance with statutory deadlines, automated escalation, and a complete audit trail for every complaint. |

## Features

### For Employees

- **Conversational complaint intake** — Talk to the bot like a trusted colleague. It asks one question at a time, in plain language, and builds a legally structured complaint from the conversation.
- **Evidence upload** — Share screenshots, emails, documents directly in the bot chat or via the dashboard tab.
- **Real-time status tracking** — Check complaint status anytime via bot message or the Dashboard tab.
- **Automatic escalation notifications** — Get notified when your complaint is acknowledged, escalated, or resolved.
- **Criminal threshold detection** — If the complaint crosses into criminal territory (BNS Sections 74–79), the bot flags it for law enforcement referral.

### For the ICC

- **ICC Dashboard** — Role-based tab view showing all complaints, timelines, and pending actions.
- **Acknowledge & respond** — Update complaint status directly from the dashboard.
- **Inquiry deadline reminders** — Automatic reminders at 30, 15, 5, and 1 day before the 90-day statutory deadline.
- **Comments** — Threaded comments on each complaint between ICC and complainant.

### The Dead Man's Switch

This is the core differentiator. Powered by [Azure Durable Functions](https://learn.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-overview):

```
Day 0:  Complaint submitted → ICC notified
Day 7:  ICC hasn't acknowledged → ICC reminder sent
Day 10: Still no response → Audit Committee notified (Section 177 vigil mechanism)
Day 17: Still no response → District Officer notified
```

Each step checks whether the ICC has already acted — if they have, the chain stops. If they haven't, it escalates. No human intervention needed. All timing is config-driven.

The 90-day inquiry deadline (POSH Act, Section 11) is monitored separately with reminders at configurable intervals.

A **daily safety-net cron job** catches any complaint that slipped through — if the Function App restarted and lost an orchestration, the cron detects it and starts a new one. Belt and suspenders.

See [docs/ESCALATION.md](docs/ESCALATION.md) for the complete technical breakdown.

## Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js 20+ with TypeScript |
| **Bot** | Microsoft Bot Framework SDK v4 + Microsoft 365 Agents Toolkit |
| **API** | Azure Functions (Node.js, TypeScript, v4 programming model) |
| **Orchestration** | Azure Durable Functions v3 (stateful complaint lifecycle workflows) |
| **Database** | Azure Cosmos DB (NoSQL) |
| **LLM** | Azure OpenAI (GPT-5.4-mini) via OpenAI SDK — Responses API with `store: true` |
| **Storage** | Azure Blob Storage (evidence files) |
| **Tab Frontend** | React 18 + Tailwind CSS v4 + Fluent UI v9 + Framer Motion |
| **Notifications** | Microsoft Graph API (email) + Bot proactive messaging + Teams Activity Feed |
| **Auth** | Microsoft Entra ID |
| **Infra** | Azure Bicep |

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 20 or 22
- [Microsoft 365 Agents Toolkit](https://aka.ms/teams-toolkit) VS Code extension
- An Azure subscription with:
  - Azure OpenAI resource (GPT-5.4-mini deployed)
  - Azure Cosmos DB account
  - Azure Blob Storage account
- A Microsoft 365 developer tenant (or sandbox)

### 1. Clone and install

```bash
git clone https://github.com/mohit67890/rakshak.git
cd rakshak
npm install
cd api && npm install && cd ..
cd tab && npm install && cd ..
```

### 2. Configure environment

Copy the example templates and fill in your values:

```bash
cp env/.env.dev.example env/.env.dev
cp env/.env.playground.example env/.env.playground
cp api/local.settings.example.json api/local.settings.json
```

Required variables:

| Variable | Description |
|---|---|
| `AZURE_OPENAI_ENDPOINT` | Your Azure OpenAI endpoint URL |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI API key |
| `AZURE_OPENAI_DEPLOYMENT_NAME` | GPT-5.4-mini deployment name |
| `COSMOS_ENDPOINT` | Cosmos DB endpoint URL |
| `COSMOS_KEY` | Cosmos DB primary key |
| `COSMOS_DATABASE` | Database name (default: `raksha-db`) |
| `BOT_ID` | Microsoft App ID for the bot |

### 3. Set up the database

```bash
cd scripts
node setup-cosmos.mjs
```

This creates the Cosmos DB database and all 6 containers: `complaints`, `conversations`, `messages`, `auditLogs`, `iccConfig`, `comments`.

### 4. Start local development

**Option A: Teams (recommended)**

Press **F5** in VS Code with the Agents Toolkit installed. This starts a dev tunnel, provisions the bot, and sideloads the app into Teams.

**Option B: Agents Playground**

```bash
npm run dev:teamsfx:playground
```

Then in another terminal:

```bash
npm run dev:teamsfx:launch-playground
```

### 5. Start the API (Azure Functions)

In a separate terminal:

```bash
# Start Azurite first (required for Durable Functions)
npx azurite --silent --location .azurite &

cd api
func start
```

### 6. Run tests

```bash
npm test
```

159 tests across 4 suites covering conversation flows, API triggers, orchestration logic, and end-to-end lifecycle.

See [docs/SETUP.md](docs/SETUP.md) for the detailed setup guide.

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                     Microsoft Teams                            │
│  ┌──────────────────┐  ┌────────────────────────────────────┐  │
│  │    Bot (1:1)      │  │          Tab (Dashboard)           │  │
│  │  Conversation     │  │  Employee: My Complaints           │  │
│  │  Intake → LLM     │  │  ICC: All Cases + Actions          │  │
│  └────────┬─────────┘  └──────────────┬─────────────────────┘  │
└───────────┼───────────────────────────┼────────────────────────┘
            │                           │
            ▼                           ▼
┌───────────────────┐      ┌─────────────────────────┐
│   Bot Server      │      │   Azure Functions API    │
│   (Node.js)       │      │   HTTP Triggers          │
│                   │      │   Durable Orchestrators   │
│   • Welcome flow  │      │   Durable Activities      │
│   • Listening flow│      │                           │
│   • LLM service   │──────│   • Complaint CRUD        │
│   • Complaint svc │      │   • Escalation chain      │
│   • Evidence svc  │      │   • Inquiry monitoring    │
│   • Audit logging │      │   • Notifications         │
└────────┬──────────┘      └──────────┬──────────────┘
         │                            │
         ▼                            ▼
┌─────────────────────────────────────────────────────┐
│                    Azure Services                    │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Cosmos DB│  │ Blob     │  │ Azure OpenAI      │  │
│  │ 6 contrs │  │ Storage  │  │ GPT-5.4-mini      │  │
│  └──────────┘  └──────────┘  └───────────────────┘  │
│  ┌──────────────────────────────────────────────┐    │
│  │ Graph API (email) + Bot Framework (proactive)│    │
│  └──────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### Project Structure

```
rakshak/
├── src/                    # Bot application
│   ├── conversations/      # Conversation flows (welcome, listening, router)
│   ├── services/           # Complaint CRUD, LLM, orchestration, evidence
│   ├── cards/              # Adaptive Card templates
│   ├── models/             # TypeScript types
│   └── utils/              # Cosmos DB client, config
│
├── api/                    # Azure Functions API
│   └── src/
│       ├── functions/
│       │   ├── httpTriggers/    # 9 HTTP endpoints
│       │   ├── orchestrators/   # 3 Durable orchestrators
│       │   └── activities/      # 5 activity functions
│       └── shared/              # Cosmos, config, notifications
│
├── tab/                    # React dashboard (Teams tab)
│   └── src/
│       ├── pages/          # Employee + ICC dashboards
│       ├── components/     # Timeline, Comments, StatusBadge
│       └── services/       # API client
│
├── appPackage/             # Teams app manifest + icons
├── infra/                  # Azure Bicep templates
├── tests/                  # Vitest test suites
└── scripts/                # Setup & utility scripts
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the deep-dive.

## Legal Framework

Rakshak's AI is grounded in five Indian legal pillars. The legal knowledge is baked into the LLM system prompt (not RAG) because the statutes are fixed and must be cited with 100% accuracy.

| Pillar | What it covers |
|---|---|
| **POSH Act, 2013** | Definition of sexual harassment, ICC constitution, complaint process, inquiry timelines (90 days), employer duties, penalties for non-compliance |
| **Bharatiya Nyaya Sanhita, 2023** (Sec 74–79) | Criminal offences: assault to outrage modesty, sexual harassment, voyeurism, stalking. Rakshak detects when complaints cross the POSH → criminal threshold |
| **Companies (Accounts) Rules, 2025** | Board's Report must disclose: complaints received, resolved, pending beyond 90 days. Rakshak auto-generates this data |
| **Companies Act, 2013** (Sec 177) | Vigil mechanism for listed companies. Rakshak's escalation to the Audit Committee serves as this mechanism |
| **DPDPA, 2023** | Consent, purpose limitation, data minimization, right to erasure. Implemented in the welcome flow and data handling |

## Cosmos DB Containers

| Container | Partition Key | Purpose |
|---|---|---|
| `complaints` | `/tenantId` | Complaint records with encrypted sensitive fields |
| `conversations` | `/visitorId` | Bot conversation state and collected data |
| `messages` | `/visitorId` | Individual message history |
| `auditLogs` | `/tenantId` | Immutable audit trail (never updated/deleted) |
| `iccConfig` | `/tenantId` | ICC member configuration per tenant |
| `comments` | `/complaintId` | Threaded comments on complaints |

## API Endpoints

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/complaints/submit` | Start complaint lifecycle orchestration |
| `GET` | `/api/complaints` | List complaints (filtered by role) |
| `GET` | `/api/complaints/{id}` | Get complaint with timeline |
| `PATCH` | `/api/complaints/{id}/status` | Update status (acknowledge/resolve) |
| `GET/POST` | `/api/complaints/{id}/comments` | Read/add comments |
| `POST` | `/api/complaints/{id}/evidence` | Upload evidence files |
| `GET` | `/api/icc/dashboard` | ICC dashboard data |
| `GET` | `/api/user/role` | Get current user's role |

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch
```

**4 test suites, 159 tests:**

| Suite | What it tests |
|---|---|
| `e2e.test.ts` | Complete conversation lifecycle: welcome → listening → review → submit |
| `api.test.ts` | HTTP triggers, Durable activities, orchestrator step-through (mocked Cosmos) |
| `orchestration.test.ts` | Config validation, notification templates, escalation timing, audience resolution |
| `api.integration.test.ts` | Real Cosmos DB operations against a test database |

## Roadmap

**Shipped:**
- [x] Conversational complaint intake with LLM-guided empathetic questioning
- [x] Evidence upload pipeline (bot + dashboard tab + Blob Storage with SAS tokens)
- [x] Dead man's switch — multi-level escalation with durable timers
- [x] 90-day inquiry deadline monitoring with configurable reminders
- [x] ICC + Employee dashboard tabs with role-based routing
- [x] Threaded comments on complaints
- [x] Immutable audit logging for every action
- [x] Daily safety-net cron for missed orchestrations
- [x] Config-driven notification system (email, proactive bot, activity feed)
- [x] Criminal threshold detection during LLM intake
- [x] 159 tests across 4 suites

**Next:**
- [ ] Criminal threshold alert surfacing in ICC dashboard
- [ ] Client-side PDF export ("Export as PDF" on complaint detail)
- [ ] Annual report orchestrator (auto-generate Board's POSH disclosure data per Companies Rules 2025)
- [ ] Multi-language support (Hindi, Marathi, Tamil, Telugu)
- [ ] Anonymous reporting mode
- [ ] AppSource marketplace submission
- [ ] WhatsApp / SMS channel support

## Deployment

Rakshak deploys to Azure as three components:

| Component | Azure Service | Scaling |
|---|---|---|
| Bot Server | Azure App Service (B1+) | Always-on for real-time messaging |
| API | Azure Functions (Consumption) | Scales to zero, per-execution billing |
| Tab | Static Web App or Blob + CDN | Globally distributed, zero-maintenance |

Infrastructure-as-code is provided via Azure Bicep templates in [`infra/`](infra/). The Microsoft 365 Agents Toolkit handles provisioning and deployment with a single `F5` in VS Code.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

This is open-source software built for Indian workplaces. Contributions — especially from those with POSH Act expertise, HR experience, or knowledge of regional labour law — are deeply welcome.

## License

[MIT](LICENSE) — free to use, modify, and distribute.

---

<p align="center">
  <sub>Built with quiet determination for the people who needed it and didn't have the tools.</sub><br>
  <sub>Made by <strong>Mohit Garg</strong> · <a href="mailto:mohit@datapuls.ai">mohit@datapuls.ai</a> · <a href="https://x.com/mohitt_garg">𝕏</a> · <a href="https://www.linkedin.com/in/mohitga/">LinkedIn</a></sub>
</p>
