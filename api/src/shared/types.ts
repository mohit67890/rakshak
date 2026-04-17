/**
 * Raksha API — Shared Types
 *
 * Minimal type definitions for the API layer.
 * These mirror the bot's models but are kept separate to avoid
 * cross-project dependencies. The source of truth is Cosmos DB.
 */

// ============================================================================
// Complaint (subset needed by activities)
// ============================================================================

export interface Complaint {
  id: string;
  tenantId: string;
  complainantId: string;
  complainantName: string;
  complaintNumber: string;
  status: string;
  severity: string;
  category: string;

  incidentDate: string;
  incidentLocation: string;
  description: string;
  accusedPersons: AccusedPerson[];
  witnesses: Witness[];
  evidenceUrls: string[];

  poshSections: string[];
  bnsSections: string[];
  isCriminalThreshold: boolean;

  assignedIccId: string | null;
  escalationLevel: number;

  submittedAt: string;
  acknowledgedAt: string | null;
  acknowledgeDeadline: string;
  inquiryStartedAt: string | null;
  inquiryDeadline: string;
  resolvedAt: string | null;
  resolution: string | null;

  // Complainant-initiated appeal to higher authority
  appealStatus?: "none" | "pending" | "under_review" | "upheld" | "rejected";
  appealedAt?: string | null;
  appealReason?: string | null;
  appealedToLevel?: number | null;
  appealReviewedAt?: string | null;
  appealOutcome?: string | null;

  conversationId: string;
  complaintPdfUrl: string | null;

  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface AccusedPerson {
  name: string;
  designation: string;
  department: string;
  relationship: string;
}

export interface Witness {
  name: string;
  designation: string;
}

// ============================================================================
// Audit Log
// ============================================================================

export type AuditAction =
  | "created"
  | "submitted"
  | "acknowledged"
  | "status_changed"
  | "escalated"
  | "viewed"
  | "pdf_generated"
  | "notification_sent"
  | "reminder_sent_icc"
  | "inquiry_reminder_sent"
  | "escalation_check_passed"
  | "escalated_audit_committee"
  | "escalated_district_officer"
  | "inquiry_deadline_breached"
  | "resolved"
  | "appealed"
  | "appeal_reviewed"
  | "annual_report_generated";

export type AuditRole = "employee" | "icc" | "admin" | "system";

export interface AuditLog {
  id: string;
  tenantId: string;
  complaintId: string;
  action: AuditAction;
  performedBy: string;
  performedByRole: AuditRole;
  details: Record<string, unknown>;
  timestamp: string;
  ipAddress: string | null;
}

// ============================================================================
// Activity Input Types
// ============================================================================

/** Input for the complaintLifecycle orchestrator */
export interface ComplaintLifecycleInput {
  complaintId: string;
  tenantId: string;
}

/** Input for the logAudit activity */
export interface LogAuditInput {
  complaintId: string;
  tenantId: string;
  action: AuditAction;
  performedBy: string;
  performedByRole: AuditRole;
  details?: Record<string, unknown>;
}

/** Input for the updateStatus activity */
export interface UpdateStatusInput {
  complaintId: string;
  tenantId: string;
  updates: Partial<Complaint>;
}

/** Input for the unified sendNotification activity */
export interface SendNotificationInput {
  /** Notification definition key from orchestration.config.json */
  notificationKey: string;
  /** Tenant ID to load iccConfig */
  tenantId: string;
  /** Template variables (complaintNumber, deadlineDays, etc.) */
  templateVars: Record<string, string | number>;
  /** Complainant info — required when audience includes "complainant" */
  complainant?: {
    name: string;
    email: string;
    userId: string;
  };
}

// ============================================================================
// Escalation & Inquiry Types
// ============================================================================

/** Input for the checkComplaintStatus activity */
export interface CheckComplaintStatusInput {
  complaintId: string;
  tenantId: string;
}

/** Output from checkComplaintStatus */
export interface CheckComplaintStatusResult {
  status: string;
  escalationLevel: number;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
}

/** Input for the escalationChain sub-orchestrator */
export interface EscalationChainInput {
  complaintId: string;
  tenantId: string;
  /** Complainant info — needed for bot notifications */
  complainant: {
    name: string;
    email: string;
    userId: string;
  };
  /** Template vars shared across all escalation notifications */
  templateVars: Record<string, string | number>;
  /** When true, skip the initial acknowledgement deadline wait (used by safety net) */
  skipInitialWait?: boolean;
}

/** Output from escalationChain */
export interface EscalationChainResult {
  escalated: boolean;
  /** Highest level reached (0=reminder, 1=audit committee, 2=district officer) */
  finalLevel: number;
  /** True if chain self-terminated because complaint was already handled */
  selfTerminated: boolean;
}

/** Input for the inquiryDeadline sub-orchestrator */
export interface InquiryDeadlineInput {
  complaintId: string;
  tenantId: string;
  /** ISO date when inquiry started (acknowledgement time) */
  inquiryStartedAt: string;
  /** Complainant info — needed for breach notification */
  complainant: {
    name: string;
    email: string;
    userId: string;
  };
  /** Template vars shared across all inquiry notifications */
  templateVars: Record<string, string | number>;
}

// ============================================================================
// Fetch Complaint Types
// ============================================================================

/** Input for the fetchComplaint activity */
export interface FetchComplaintInput {
  complaintId: string;
  tenantId: string;
}

/** Output from fetchComplaint — essential data for orchestration */
export interface FetchComplaintResult {
  complaintNumber: string;
  complainantName: string;
  complainantId: string;
  category: string;
  severity: string;
  isCriminalThreshold: boolean;
  escalationLevel: number;
}
