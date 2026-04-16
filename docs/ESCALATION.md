# Escalation System — The Dead Man's Switch

> *"If nobody acts, the system acts for you."*

Rakshak's escalation system is the core differentiator. Every other POSH tool is an ICC-side dashboard — it helps the committee manage complaints. Rakshak puts the power on the **employee side**. If the ICC ignores a complaint, the system automatically escalates — first to the Audit Committee, then to the District Officer. No human intervention needed.

This document explains how it works.

---

## Why This Matters

Recent cases in India have shown that even large, well-known organisations can fail their employees when internal reporting channels are compromised. Complaints get suppressed, ICCs don't act, and the system — paper forms, email inboxes, HR portals — relies on the same people who may be enabling the problem.

Rakshak's dead man's switch makes suppression structurally impossible. The complaint enters an automated pipeline. If the ICC doesn't acknowledge within the legal timeframe, the system escalates without asking anyone's permission.

---

## Complaint Lifecycle

```
┌─────────┐     ┌───────────┐     ┌───────────────┐     ┌──────────┐
│  Draft   │ ──→ │ Submitted │ ──→ │ Under Inquiry │ ──→ │ Resolved │
└─────────┘     └───────────┘     └───────────────┘     └──────────┘
    Bot              Bot +             ICC                   ICC
  creates          orchestrator      acknowledges          submits
                    starts                                 findings
```

### Status Definitions

| Status | Who sets it | What it means |
|---|---|---|
| `draft` | Bot | User is still building the complaint in conversation |
| `submitted` | Bot (submitDraft) | Complaint finalized. ICC notified. Acknowledgement clock starts. |
| `under_inquiry` | Orchestrator | ICC acknowledged. 90-day inquiry clock starts. |
| `resolved` | Orchestrator | ICC submitted findings. Complaint closed. |

### Key Design Decision: No `escalated` status

Escalation is tracked by `escalationLevel` (0→1→2), **not** by changing the complaint status. Why?

- A complaint escalated to the Audit Committee can still be acknowledged — it shouldn't be stuck in a dead-end status.
- The status tracks *workflow progress* (submitted → under inquiry → resolved). The escalation level tracks *who is responsible* (ICC → Audit Committee → District Officer).
- This lets the Audit Committee "acknowledge" the same way ICC would, and the inquiry clock starts normally.

---

## The Two Mechanisms

### 1. Per-Complaint Orchestrations (Primary — Event-Driven)

When a complaint is submitted, Azure Durable Functions starts a **long-running orchestration** that lives for the entire complaint lifecycle — potentially weeks or months. This orchestration uses **durable timers** that don't consume resources while waiting.

```
submitComplaint (HTTP trigger)
  └→ complaintLifecycle orchestrator (instanceId = complaintId)
       ├─ Phase 1: Post-submission pipeline
       │    ├─ generatePdf
       │    ├─ uploadToBlob
       │    ├─ updateStatus (set PDF URL)
       │    ├─ sendNotification("complaint_submitted")
       │    ├─ if criminal threshold: sendNotification("criminal_threshold_alert")
       │    └─ logAudit("submitted")
       │
       ├─ Phase 2: Escalation chain (sub-orchestrator)
       │    └─ See "Escalation Chain" below
       │
       ├─ WAIT for: "complaint_acknowledged" event OR escalation completes
       │
       ├─ Phase 3: Inquiry monitoring (sub-orchestrator, after acknowledgement)
       │    └─ See "Inquiry Deadline" below
       │
       └─ WAIT for: "complaint_resolved" event OR inquiry breaches
```

**How events reach the orchestrator:**

The ICC dashboard (tab UI) calls `PATCH /api/complaints/{id}/status` with `{ status: "acknowledged" }` or `{ status: "resolved" }`. The HTTP trigger raises an **external event** to the running orchestration:

```
ICC clicks "Acknowledge" in dashboard
  → PATCH /api/complaints/{id}/status { status: "acknowledged" }
  → Azure Durable Functions: raiseEvent(complaintId, "complaint_acknowledged")
  → Running orchestrator wakes up and proceeds to inquiry phase
```

### 2. Daily Safety Net (Backup — Cron-Based)

A **timer trigger** runs every day at 9:00 AM IST (3:30 AM UTC). It queries Cosmos DB for all complaints that should have been escalated but might not have a running orchestration (e.g., if the Function App crashed and lost state).

```
dailyEscalationCheck (timer trigger, every day 9 AM IST)
  ├─ Query: complaints WHERE status = "submitted" AND acknowledgeDeadline < now
  │    → For each: verify orchestration exists, if not start one
  │
  └─ Query: complaints WHERE status = "under_inquiry" AND inquiryDeadline < now
       → For each: verify orchestration exists, if not start one
```

This is the "belt and suspenders" approach. The per-complaint orchestrations are the primary mechanism. The daily cron is the fallback. In practice, the cron should never find anything to do — but if it does, it means something failed silently, and the safety net caught it.

---

## Escalation Chain (Sub-Orchestrator)

Driven entirely by `orchestration.config.json`. No hardcoded values.

### Timeline

```
Day 0: Complaint submitted. ICC notified.
        ┊
Day 7: Acknowledgement deadline passes (configurable, default 7 days)
        │
        ├─ CHECK: Is complaint still status "submitted"?
        │   └─ No → self-terminate (ICC already acted, log "escalation_check_passed")
        │   └─ Yes → continue ↓
        │
        ├─ LEVEL 0: ICC Reminder
        │   ├─ Send: icc_reminder (email to Presiding Officer + all members)
        │   └─ Log: "reminder_sent_icc"
        ┊
Day 10: +3 days after reminder (configurable)
        │
        ├─ CHECK: Is complaint still status "submitted"?
        │   └─ No → self-terminate
        │   └─ Yes → continue ↓
        │
        ├─ LEVEL 1: Audit Committee Escalation
        │   ├─ Update: escalationLevel = 1
        │   ├─ Send: escalated_audit_committee (email to Audit Committee + ICC)
        │   ├─ Send: complainant_escalated_audit (bot message to complainant)
        │   └─ Log: "escalated_audit_committee"
        ┊
Day 17: +7 days after Audit Committee escalation (configurable)
        │
        ├─ CHECK: Is complaint still status "submitted"?
        │   └─ No → self-terminate
        │   └─ Yes → continue ↓
        │
        └─ LEVEL 2: District Officer Escalation
            ├─ Update: escalationLevel = 2
            ├─ Send: escalated_district_officer (email to DO + Nodal Officer + ICC)
            ├─ Send: complainant_escalated_district (bot message to complainant)
            └─ Log: "escalated_district_officer"
```

### Self-Termination (Critical)

The escalation chain **cannot be cancelled** by the parent orchestrator — Durable Functions don't support cancelling sub-orchestrators. Instead, the chain checks the complaint status from Cosmos DB via a `checkComplaintStatus` activity at each step.

If the complaint has been acknowledged (status ≠ `submitted`), the chain logs `escalation_check_passed` and returns. The parent orchestrator handles the acknowledgement workflow.

This is the **key correctness requirement**. Without this check, the chain would keep escalating even after ICC acts.

### Config-Driven

All timing and notification details come from `api/src/orchestration.config.json`:

```json
{
  "acknowledgement": {
    "deadlineDays": 7
  },
  "escalation": {
    "levels": [
      { "level": 0, "waitDaysAfterPrevious": 0, "action": "remind_icc", "notifications": ["icc_reminder"] },
      { "level": 1, "waitDaysAfterPrevious": 3, "action": "escalate", "notifications": ["escalated_audit_committee", "complainant_escalated_audit"] },
      { "level": 2, "waitDaysAfterPrevious": 7, "action": "escalate", "notifications": ["escalated_district_officer", "complainant_escalated_district"] }
    ]
  }
}
```

To change the escalation timeline, edit the config. No code changes needed.

---

## Inquiry Deadline (Sub-Orchestrator)

The POSH Act, 2013 (Section 11) mandates that the ICC must complete its inquiry within **90 days** of the complaint being filed. Rakshak monitors this automatically.

### Timeline

```
Day 0: ICC acknowledges complaint.
        inquiryStartedAt = now, inquiryDeadline = now + 90 days
        ┊
Day 60: ─── Reminder: "30 days remaining" (normal urgency)
        ┊
Day 75: ─── Reminder: "15 days remaining" (normal urgency)
        ┊
Day 85: ─── URGENT: "5 days remaining" (high urgency, all ICC members)
        ┊
Day 89: ─── FINAL: "Inquiry must complete TODAY" (critical, all ICC members)
        ┊
Day 90: CHECK: Is complaint resolved?
        │
        ├─ Yes → self-terminate
        └─ No → BREACH
             ├─ Log: "inquiry_deadline_breached"
             ├─ Send: complainant_inquiry_breached (bot message)
             ├─ Send: escalated_audit_committee (email)
             └─ Return breach result to parent orchestrator
```

### How Resolution Works

Same pattern as acknowledgement:

```
ICC clicks "Submit Resolution" in dashboard
  → PATCH /api/complaints/{id}/status { status: "resolved", resolution: "..." }
  → raiseEvent(complaintId, "complaint_resolved")
  → Parent orchestrator wakes up, inquiry sub-orchestrator self-terminates on next check
```

---

## Audit Trail

Every action in the escalation system creates an immutable audit log entry in Cosmos DB. These entries can never be modified or deleted. They form the legally admissible record.

| Action | When | Logged By |
|---|---|---|
| `submitted` | Complaint submitted by employee | system |
| `reminder_sent_icc` | ICC reminder sent (deadline missed) | system |
| `escalation_check_passed` | Escalation check found complaint already acknowledged | system |
| `escalated_audit_committee` | Escalated to Audit Committee | system |
| `escalated_district_officer` | Escalated to District Officer | system |
| `acknowledged` | ICC/Audit Committee acknowledged | icc |
| `inquiry_deadline_breached` | 90-day inquiry deadline passed without resolution | system |
| `resolved` | ICC submitted findings | icc |

The `escalation_check_passed` entry is important — it proves the system was actively monitoring even when no escalation was needed. This preempts any argument that the system "failed silently."

---

## Edge Cases

### ICC acknowledges during escalation timer

The escalation chain checks status at each step. If ICC acknowledged while the timer was waiting, the next check finds `status ≠ submitted` and self-terminates. No duplicate escalation emails.

### Function App restarts mid-orchestration

Durable Functions checkpoint after every `yield`. If the app restarts:
- Timers survive — they're persisted in Azure Storage
- The orchestration replays from the last checkpoint
- Activities are not re-executed (their results are cached)

This is why durable timers (not `setTimeout`) are essential.

### Multiple escalation levels acknowledge

The Audit Committee acknowledges after Level 1 escalation. The complaint transitions to `under_inquiry` the same way it would if ICC had acknowledged. The `escalationLevel` stays at 1, which is preserved in the audit trail to show it required escalation.

### Complaint submitted when Function App is down

The daily safety net (`dailyEscalationCheck`) catches this. On the next cron run, it finds the complaint is past its deadline with no running orchestration, and starts one.

### Criminal threshold complaint

If `isCriminalThreshold` is true at submission time, the orchestrator immediately sends `criminal_threshold_alert` — an email to the ICC Presiding Officer citing applicable BNS sections, plus a bot message to the complainant about their right to file a police complaint. This happens **before** the escalation chain starts, as part of the submission pipeline.

---

## Testing Escalation Locally

### Fast-Forward Timers

When running locally with Azurite, you can fast-forward durable timers via the Durable Functions HTTP API:

```bash
# Advance all pending timers for a complaint's orchestration
POST http://localhost:7071/runtime/webhooks/durabletask/instances/{complaintId}/raiseEvent/complaint_acknowledged
Content-Type: application/json

{ "timestamp": "2026-04-15T10:00:00Z" }
```

### Simulate Full Escalation

1. Submit a complaint via the bot
2. Wait for the orchestration to start (check logs)
3. Don't acknowledge — let the timers fire
4. Watch the escalation chain: reminder → Audit Committee → District Officer
5. Check audit logs in Cosmos DB for the full trail

### Override Deadlines for Testing

Set shorter deadlines in `orchestration.config.json`:
```json
{
  "acknowledgement": { "deadlineDays": 0 },
  "escalation": {
    "levels": [
      { "level": 0, "waitDaysAfterPrevious": 0 },
      { "level": 1, "waitDaysAfterPrevious": 0 },
      { "level": 2, "waitDaysAfterPrevious": 0 }
    ]
  }
}
```

This makes all timers fire immediately — useful for integration testing.

---

## Legal Basis

| Mechanism | Legal Requirement |
|---|---|
| 7-day acknowledgement deadline | POSH Act Section 9 — complaint must be acted upon promptly |
| 90-day inquiry deadline | POSH Act Section 11(4) — inquiry to be completed within 90 days |
| Escalation to Audit Committee | Companies Act Section 177(9-10) — vigil mechanism / whistleblower channel |
| Escalation to District Officer | POSH Act Section 6 — Local Complaints Committee when ICC fails |
| Criminal threshold alert | POSH Act Section 19(d) — employer must assist in filing police complaint |
| Immutable audit trail | DPDPA 2023 + Companies (Accounts) Rules 2025 — record-keeping requirements |
| Annual report data | POSH Act Section 21-22 + Companies Rules 2025 — mandatory Board disclosure |
