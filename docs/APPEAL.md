# Appeal Mechanism — The Complainant's Lever

> *"The system acts automatically. But the complainant can always act for themselves."*

Rakshak's [escalation system](./ESCALATION.md) is the automatic dead man's switch — it fires when the ICC misses deadlines. The **appeal mechanism** is the complementary, complainant-initiated path: a formal way for the victim to escalate the complaint to a higher authority at any moment where they've lost confidence in the current handler, and to be made explicitly aware of statutory rights that operate in parallel to any internal process.

Auto-escalation answers *"What if the ICC does nothing?"*. Appeals answer *"What if the ICC does the wrong thing — or simply isn't the right authority any more?"*

---

## Why a separate mechanism

Auto-escalation is time-driven. It fires when:
- The ICC misses the acknowledgement deadline, or
- The 90-day inquiry deadline is breached.

It cannot fire when:
- The ICC **did** act, but the resolution is manifestly unsatisfactory to the complainant.
- The complainant, independent of any deadline, has lost trust in the handling and wants a different authority to review it.
- The complainant wants to pursue a parallel criminal or civil remedy at the same time as the internal process.

The appeal mechanism closes these gaps without waiting for a clock to expire.

---

## The Three Available Actions

The complainant's detail page renders **three always-visible layers** of options on their own complaint:

### 1. Internal appeal — file within Rakshak

| Target | Backed by | When it makes sense |
|---|---|---|
| **Audit Committee** (level 1) | Companies Act, 2013 §177(9–10) vigil mechanism | First escalation for listed / large companies where the Audit Committee already has statutory oversight of whistleblower complaints. |
| **District Officer** (level 2) | POSH Act, 2013 §6 | Direct statutory route. May constitute a Local Complaints Committee. Also notifies the Nodal Officer for SHe-Box compliance. |

The complainant submits a reason (20–2000 chars). Rakshak:
1. Records the appeal against the complaint (`appealStatus`, `appealedAt`, `appealReason`, `appealedToLevel`).
2. Sets the complaint `status` to `escalated` and bumps `escalationLevel`.
3. Writes an `appealed` entry to the immutable audit trail with the full reason.
4. Fires the `complaint_appealed_audit_committee` or `complaint_appealed_district_officer` notification via the unified dispatcher — emails the target authority + the ICC Presiding Officer; pings the complainant via the bot for confirmation.

### 2. External rights — always surfaced, never exhausted

These are not Rakshak actions. They are statutory rights that exist **in parallel** to any internal process, and the tab surfaces them permanently so the complainant never has to discover them elsewhere:

| Right | Legal basis | What Rakshak does |
|---|---|---|
| **Police complaint / FIR** | Bharatiya Nyaya Sanhita §§ 74–79; POSH Act §19(d) | Highlights the red-bordered police card when the complaint was flagged as crossing the criminal threshold during intake. Cites the BNS sections detected. References the employer's §19(d) obligation to assist with filing. |
| **Court appeal** | POSH Act §18 (90-day window) | Surfaces the 90-day clock and, where resolution is final, the calculated start date. |
| **SHe-Box portal** | Ministry of Women & Child Development (`shebox.wcd.gov.in`) | Direct reference, plus the Nodal Officer is copied on any District Officer appeal for correlation. |

### 3. Continued escalation after rejection

If the Audit Committee rejects a level-1 appeal, the panel does **not** become terminal. The complainant can still file a level-2 appeal to the District Officer — the form is re-presented with `"Escalate to a higher authority"` framing and the previous rejection summarised above it.

Only once the District Officer has been engaged is the internal appeal path exhausted. The external-rights card remains visible regardless.

---

## Eligibility Rules

A complainant may file an internal appeal when **any** of the following hold:

1. `status === "resolved"` (or `resolvedAt` is set) — they are unsatisfied with the outcome.
2. The acknowledgement deadline has passed without acknowledgement.
3. The 90-day inquiry deadline has been breached.
4. A previous appeal was `rejected` and an unused escalation level remains.

And **all** of the following must be true:

- The requester is the complainant themselves (`complainantId === userId`).
- The complaint is not in `draft`.
- No other appeal is currently `pending` or `under_review`.
- `targetLevel > (complaint.appealedToLevel || 0)` — appeals only go up, never down or sideways.
- The complaint has not already reached level 2 (District Officer).

These rules are enforced server-side in [`api/src/functions/httpTriggers/appealComplaint.ts`](../api/src/functions/httpTriggers/appealComplaint.ts) and mirrored client-side in [`tab/src/components/AppealPanel.tsx`](../tab/src/components/AppealPanel.tsx) for UX. The server is the source of truth.

---

## Data Model

Appeal state lives on the complaint document (single source of truth — no separate appeals container).

```ts
interface Complaint {
  // … existing fields …

  // Complainant-initiated appeal to higher authority
  appealStatus: "none" | "pending" | "under_review" | "upheld" | "rejected";
  appealedAt: string | null;
  appealReason: string | null;       // Verbatim, as typed by complainant
  appealedToLevel: number | null;    // 1 = Audit Committee, 2 = District Officer
  appealReviewedAt: string | null;
  appealOutcome: string | null;      // Set by the reviewing authority (future)
}
```

`appealStatus` is a small state machine:

```
none ──(file appeal)──▶ pending ──(reviewer accepts)──▶ under_review ──┬──▶ upheld
                             │                                         └──▶ rejected ──(re-appeal)──▶ pending (next level)
                             └───────────────────────────(direct decision)─▶ upheld / rejected
```

Two new audit actions are recorded in the append-only `auditLogs` container:

| Action | Written by | Details captured |
|---|---|---|
| `appealed` | `appealComplaint` HTTP trigger | `targetLevel`, `targetAuthority`, `reason`, `previousStatus` |
| `appeal_reviewed` | (future) reviewer endpoint | `outcome: "upheld" \| "rejected"`, reviewer identity, rationale |

---

## API

### `POST /api/complaints/{complaintId}/appeal`

**Request**

```json
{
  "tenantId": "<tenant-id>",
  "userId":   "<complainant-entra-object-id>",
  "targetLevel": 1,
  "reason": "The ICC closed the complaint without interviewing the witnesses I named."
}
```

**Validation**

| Field | Rule |
|---|---|
| `tenantId`, `userId` | Required. `userId` must equal `complaint.complainantId`. |
| `targetLevel` | `1` (Audit Committee) or `2` (District Officer). Must be strictly greater than any previous `appealedToLevel`. |
| `reason` | Trimmed length 20–2000 chars. Stored verbatim. |

**Responses**

| Status | When |
|---|---|
| `200` | Appeal filed successfully. Returns `{ success, complaintId, appealStatus: "pending", appealedToLevel, appealedAt }`. |
| `400` | Invalid input, ineligible status, or reason too short/long. |
| `403` | Requester is not the complainant. |
| `404` | Complaint not found in tenant. |
| `409` | An appeal is already pending, the complaint has been modified concurrently (optimistic-concurrency 412 surfaced as 409), or the target level has been exhausted. |
| `500` | Persistence failure. |

**Side effects (on success, in order)**

1. **Update complaint** (optimistic concurrency via `etag`): status → `escalated`, `escalationLevel = max(existing, targetLevel)`, appeal fields populated, `version++`.
2. **Audit log** `appealed` entry with full reason.
3. **Notification dispatch** — best-effort; failure does **not** roll back the appeal (the appeal is already persisted and audit-logged).

---

## Notifications

All notifications flow through the unified [`notificationDispatcher`](../api/src/shared/notificationDispatcher.ts) and are defined in [`orchestration.config.json`](../api/src/orchestration.config.json). No bespoke delivery code.

### `complaint_appealed_audit_committee` (level 1)

| Audience | Channel | What they see |
|---|---|---|
| `escalation_contacts_level_1` | Email | Full appeal notice with verbatim reason, Companies Act §177 citation, complaint timeline. |
| `icc_presiding_officer` | Email | Informational: "The complainant has appealed your handling to the Audit Committee." |
| `complainant` | Bot | Confirmation with next-step guidance. |

### `complaint_appealed_district_officer` (level 2)

| Audience | Channel | What they see |
|---|---|---|
| `escalation_contacts_level_2` | Email | Final escalation notice citing POSH Act §6, with reason and full timeline. |
| `nodal_officer` | Email | SHe-Box compliance notification. |
| `icc_presiding_officer` | Email | Informational notice. |
| `complainant` | Bot | Confirmation + reminder of POSH §18 court-appeal right. |

All templates use `{{complaintNumber}}`, `{{appealReason}}`, `{{currentStatus}}`, `{{submittedDate}}`, and `{{targetAuthority}}` — rendered per recipient.

---

## UI — The Appeal Section

Rendered on the complaint detail page ([`tab/src/pages/ComplaintDetail.tsx`](../tab/src/pages/ComplaintDetail.tsx)) **only** when:
- The viewer's role is `employee`, **and**
- The viewer is the complainant (`complaint.complainantId === user.userId`), **and**
- The complaint is not in `draft`.

The panel ([`tab/src/components/AppealPanel.tsx`](../tab/src/components/AppealPanel.tsx)) is built from three stacked cards:

1. **Previous appeal card** — shows filing status (`pending`, `under_review`) or outcome (`upheld`, `rejected`) with the reason quoted back to the complainant. Absent if no appeal has been filed.
2. **Appeal action card** — either the form, an eligibility hint, or a terminal message if internal levels are exhausted.
3. **External rights card** — *always* rendered. Police / courts / SHe-Box. The police card turns red with the detected BNS sections inlined when `isCriminalThreshold` is true.

The form:
- Radio between Audit Committee (hidden once already at level 1) and District Officer.
- Textarea for the reason with live character count (20 min, 2000 max).
- Clear disclosure: *"Your appeal and its reason will be logged in a tamper-proof audit trail and emailed to the authority you select. The ICC Presiding Officer will be notified that you've appealed."*

---

## Interaction With Auto-Escalation

The two mechanisms coexist cleanly:

| Scenario | Auto-escalation | Appeal mechanism |
|---|---|---|
| ICC silent past ack deadline | Fires level-0 reminder, then level-1, then level-2 on its schedule. | Complainant can pre-empt at any point by filing an appeal. If they do, the status becomes `escalated` — the auto-chain's self-termination check will see the new state and no-op. |
| ICC acknowledged, inquiry silent | Inquiry deadline sub-orchestrator runs reminders. | Complainant may appeal once 90 days elapse without resolution. |
| ICC resolved unfavourably | Auto-escalation does not re-fire (status is terminal from its perspective). | **This is the main case the appeal exists for.** |
| Previous appeal rejected | Not involved. | Complainant can re-file to the next higher level. |

The appeal never interferes with an ongoing auto-orchestration — it doesn't cancel the orchestration, it simply sets state that subsequent checkpoints observe.

---

## Future Work

- **Reviewer endpoint** — `PATCH /api/complaints/{id}/appeal` for the Audit Committee or District Officer to record `upheld` / `rejected` with `appealOutcome`, emitting an `appeal_reviewed` audit entry.
- **Reviewer dashboard view** — surfaces pending appeals to the escalation contacts when they authenticate (currently, notifications are email-only).
- **SHe-Box direct integration** — when a public API becomes available, a District Officer appeal could forward the packet automatically rather than relying on email notification.
- **Entra ID token validation** — at present, all HTTP triggers trust `userId` from the request body (marked `// TODO: Add Entra ID token validation in Phase 2`). This applies to `/appeal` as it does to every other endpoint.

---

## Legal Basis Summary

| Layer | Statute | Role in the appeal path |
|---|---|---|
| Level 1 — Audit Committee | Companies Act, 2013 §177(9–10) | Vigil mechanism for listed / large private companies. Board-level accountability. |
| Level 2 — District Officer | POSH Act, 2013 §6 | Statutory authority. Can constitute a Local Complaints Committee. |
| Police / FIR | Bharatiya Nyaya Sanhita, 2023 §§ 74–79; POSH Act §19(d) | Criminal remedy. Employer obligated to assist. |
| Court appeal | POSH Act, 2013 §18 | 90-day appellate window against ICC recommendations. |
| SHe-Box | Ministry of Women & Child Development | Government-operated parallel intake. |

---

## See Also

- [ESCALATION.md](./ESCALATION.md) — the automatic dead man's switch.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — system overview.
- [`api/src/functions/httpTriggers/appealComplaint.ts`](../api/src/functions/httpTriggers/appealComplaint.ts) — HTTP handler source.
- [`tab/src/components/AppealPanel.tsx`](../tab/src/components/AppealPanel.tsx) — UI source.
- [`api/src/orchestration.config.json`](../api/src/orchestration.config.json) — notification templates.
