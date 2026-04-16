/**
 * Raksha — Complaint Service
 *
 * CRUD operations for complaints in Cosmos DB.
 *
 * Lifecycle:
 *   1. createDraft()    — when user enters intake mode, creates a draft in `complaints` container
 *   2. updateDraft()    — after each LLM turn, merges newly extracted data into the draft
 *   3. getDraft()       — before LLM calls, loads the draft for context
 *   4. submitDraft()    — validates minimum fields, flips status to "submitted", sets deadlines
 *   5. getForVisitor()  — lists all complaints for a user (tab dashboard)
 *
 * The draft document lives in the `complaints` container from the start.
 * This means:
 *   - Data survives even if the conversation record is lost
 *   - The tab can show in-progress drafts
 *   - Schema is enforced at the document level, not just in-memory
 */

import { v4 as uuid } from "uuid";
import { getRakshaContainers } from "../utils/cosmosClient";
import config from "../config";
import { writeAudit } from "./auditService";
import type {
  Complaint,
  ComplaintSeverity,
  ComplaintCategory,
  AccusedPerson,
  Witness,
} from "../models/complaint";

// ============================================================================
// Human-Readable Complaint Number
// ============================================================================

/**
 * Generate a human-readable complaint number: RKSH-YYYYMM-XXXX
 * Not globally unique — paired with the UUID `id` for uniqueness.
 */
function generateComplaintNumber(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `RKSH-${yyyy}${mm}-${rand}`;
}

// ============================================================================
// Create Draft
// ============================================================================

/**
 * Create a new draft complaint in Cosmos DB.
 * Called when the user enters intake mode (clicks "Report" or "Start Intake").
 *
 * Returns the created complaint document with `status: 'draft'`.
 */
export async function createDraft(
  complainantId: string,
  tenantId: string,
  conversationId: string,
): Promise<Complaint> {
  const { complaints } = await getRakshaContainers();
  const now = new Date().toISOString();

  const draft: Complaint = {
    id: uuid(),
    tenantId,
    complainantId,
    complainantName: "", // populated from auth context later
    complaintNumber: generateComplaintNumber(),
    status: "draft",
    severity: "medium",
    category: "other",

    incidentDate: "",
    incidentLocation: "",
    description: "",
    accusedPersons: [],
    witnesses: [],
    evidenceUrls: [],

    poshSections: [],
    bnsSections: [],
    isCriminalThreshold: false,

    assignedIccId: null,
    escalationLevel: 0,

    submittedAt: "",
    acknowledgedAt: null,
    acknowledgeDeadline: "",
    inquiryStartedAt: null,
    inquiryDeadline: "",
    resolvedAt: null,
    resolution: null,

    conversationId,
    complaintPdfUrl: null,

    createdAt: now,
    updatedAt: now,
    version: 1,
  };

  return complaints.create(draft).then((created) => {
    // Fire-and-forget audit — must not block complaint creation
    writeAudit({
      complaintId: created.id,
      tenantId,
      action: "created",
      performedBy: complainantId,
      performedByRole: "employee",
      details: {
        complaintNumber: created.complaintNumber,
        conversationId,
      },
    }).catch((err) =>
      console.error(`[raksha] Audit write failed for draft creation: ${err}`),
    );
    return created;
  });
}

// ============================================================================
// Read Draft
// ============================================================================

/**
 * Load a complaint by ID. Returns null if not found.
 */
export async function getDraft(
  complaintId: string,
  tenantId: string,
): Promise<Complaint | null> {
  const { complaints } = await getRakshaContainers();
  return complaints.read(complaintId, tenantId);
}

// ============================================================================
// Update Draft — Incremental Merge
// ============================================================================

/**
 * Merge newly extracted data into an existing draft complaint.
 * Called after each LLM turn during intake.
 *
 * Merge logic:
 *   - description: appends (narrative builds over time)
 *   - accusedPersons / witnesses: deduplicates by name, adds new entries
 *   - poshSections / bnsSections: set union
 *   - scalar fields (date, location, category, severity): overwrites with latest
 */
export async function updateDraft(
  complaintId: string,
  tenantId: string,
  data: Partial<Complaint>,
): Promise<Complaint> {
  const { complaints } = await getRakshaContainers();
  const existing = await complaints.read(complaintId, tenantId);

  if (!existing) {
    throw new Error(`[complaintService] Complaint ${complaintId} not found`);
  }
  if (existing.status !== "draft") {
    throw new Error(`[complaintService] Complaint ${complaintId} is not a draft (status: ${existing.status})`);
  }

  const merged = mergeComplaintData(existing, data);
  merged.updatedAt = new Date().toISOString();

  return complaints.replace(complaintId, tenantId, merged);
}

// ============================================================================
// Submit Draft
// ============================================================================

/**
 * Validate a draft has minimum required fields and transition to "submitted".
 * Sets acknowledgement deadline based on ICC config.
 *
 * Throws if required fields are missing — the caller should catch and
 * tell the user what's needed.
 */
export async function submitDraft(
  complaintId: string,
  tenantId: string,
): Promise<Complaint> {
  const { complaints } = await getRakshaContainers();
  const complaint = await complaints.read(complaintId, tenantId);

  if (!complaint) {
    throw new Error(`[complaintService] Complaint ${complaintId} not found`);
  }
  if (complaint.status !== "draft") {
    throw new Error(`[complaintService] Complaint ${complaintId} is not a draft`);
  }

  // Validate minimum required fields
  const missing: string[] = [];
  if (!complaint.description) missing.push("incident description");
  if (!complaint.accusedPersons.length) missing.push("accused person(s)");
  if (!complaint.incidentDate) missing.push("incident date");

  if (missing.length > 0) {
    throw new SubmissionValidationError(missing);
  }

  const acknowledgementDeadlineDays = config.orchestration.acknowledgement.deadlineDays;

  const now = new Date();
  const deadline = new Date(now);
  deadline.setDate(deadline.getDate() + acknowledgementDeadlineDays);

  complaint.status = "submitted";
  complaint.submittedAt = now.toISOString();
  complaint.acknowledgeDeadline = deadline.toISOString();
  complaint.updatedAt = now.toISOString();
  complaint.version += 1;

  return complaints.replace(complaintId, tenantId, complaint).then((submitted) => {
    // Fire-and-forget audit — must not block submission
    writeAudit({
      complaintId,
      tenantId,
      action: "submitted",
      performedBy: complaint.complainantId,
      performedByRole: "employee",
      details: {
        complaintNumber: complaint.complaintNumber,
        acknowledgeDeadline: complaint.acknowledgeDeadline,
      },
    }).catch((err) =>
      console.error(`[raksha] Audit write failed for submission: ${err}`),
    );
    return submitted;
  });
}

/**
 * Validation error thrown when a draft is missing required fields for submission.
 */
export class SubmissionValidationError extends Error {
  readonly missingFields: string[];

  constructor(missingFields: string[]) {
    super(`Cannot submit: missing ${missingFields.join(", ")}`);
    this.name = "SubmissionValidationError";
    this.missingFields = missingFields;
  }
}

// ============================================================================
// Query
// ============================================================================

/**
 * Get all complaints for a user, ordered by most recent first.
 */
export async function getForVisitor(
  complainantId: string,
  tenantId: string,
): Promise<Complaint[]> {
  const { complaints } = await getRakshaContainers();
  return complaints.queryWithParams<Complaint>(
    "SELECT * FROM c WHERE c.complainantId = @complainantId ORDER BY c.updatedAt DESC",
    [{ name: "@complainantId", value: complainantId }],
    { partitionKey: tenantId },
  );
}

// ============================================================================
// Context Helper — extract content fields for LLM intake context
// ============================================================================

/**
 * Extract only the "content" fields from a complaint for the LLM context.
 * Omits metadata (id, tenantId, version, timestamps, etc.) so the LLM
 * sees a clean view of what's been collected.
 */
export function complaintToContext(complaint: Complaint): Partial<Complaint> {
  const ctx: Partial<Complaint> = {};

  if (complaint.description) ctx.description = complaint.description;
  if (complaint.incidentDate) ctx.incidentDate = complaint.incidentDate;
  if (complaint.incidentLocation) ctx.incidentLocation = complaint.incidentLocation;
  if (complaint.accusedPersons.length) ctx.accusedPersons = complaint.accusedPersons;
  if (complaint.witnesses.length) ctx.witnesses = complaint.witnesses;
  if (complaint.category !== "other") ctx.category = complaint.category;
  if (complaint.severity !== "medium") ctx.severity = complaint.severity;
  if (complaint.isCriminalThreshold) ctx.isCriminalThreshold = true;
  if (complaint.poshSections.length) ctx.poshSections = complaint.poshSections;
  if (complaint.bnsSections.length) ctx.bnsSections = complaint.bnsSections;

  return ctx;
}

// ============================================================================
// Merge Logic
// ============================================================================

/**
 * Merge incoming extracted data into an existing complaint.
 *
 * - description: appends fragments (narrative grows turn by turn)
 * - accusedPersons / witnesses: adds new entries, deduplicates by name
 * - poshSections / bnsSections: set union
 * - scalar fields: latest value wins
 */
function mergeComplaintData(
  existing: Complaint,
  incoming: Partial<Complaint>,
): Complaint {
  const merged = { ...existing };

  // Scalar overwrites
  if (incoming.incidentDate) merged.incidentDate = incoming.incidentDate;
  if (incoming.incidentLocation) merged.incidentLocation = incoming.incidentLocation;
  if (incoming.category) merged.category = incoming.category as ComplaintCategory;
  if (incoming.severity) merged.severity = incoming.severity as ComplaintSeverity;
  if (incoming.isCriminalThreshold !== undefined) {
    merged.isCriminalThreshold = incoming.isCriminalThreshold;
  }

  // Description: append narrative fragments
  if (incoming.description) {
    merged.description = merged.description
      ? `${merged.description}\n\n${incoming.description}`
      : incoming.description;
  }

  // Accused persons: deduplicate by lowercase name
  if (incoming.accusedPersons?.length) {
    const names = new Set(merged.accusedPersons.map((p) => p.name.toLowerCase()));
    for (const person of incoming.accusedPersons as AccusedPerson[]) {
      if (!names.has(person.name.toLowerCase())) {
        merged.accusedPersons.push(person);
        names.add(person.name.toLowerCase());
      }
    }
  }

  // Witnesses: deduplicate by lowercase name
  if (incoming.witnesses?.length) {
    const names = new Set(merged.witnesses.map((w) => w.name.toLowerCase()));
    for (const witness of incoming.witnesses as Witness[]) {
      if (!names.has(witness.name.toLowerCase())) {
        merged.witnesses.push(witness);
        names.add(witness.name.toLowerCase());
      }
    }
  }

  // Legal classifications: set union
  if (incoming.poshSections?.length) {
    merged.poshSections = [...new Set([...merged.poshSections, ...incoming.poshSections])];
  }
  if (incoming.bnsSections?.length) {
    merged.bnsSections = [...new Set([...merged.bnsSections, ...incoming.bnsSections])];
  }

  // Evidence URLs: set union (deduplicate by URL)
  if (incoming.evidenceUrls?.length) {
    merged.evidenceUrls = [...new Set([...merged.evidenceUrls, ...incoming.evidenceUrls])];
  }

  return merged;
}
