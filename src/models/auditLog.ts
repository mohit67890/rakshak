/**
 * Raksha — Audit Log Model
 *
 * Cosmos DB container: "auditLogs"
 * Partition key: /tenantId
 * TTL: Never (immutable audit trail)
 */

import type { BaseDocument } from "../database/types";

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
  | "annual_report_generated";

export type AuditRole = "employee" | "icc" | "admin" | "system";

export interface AuditLog extends BaseDocument {
  id: string;
  tenantId: string;
  complaintId: string;
  action: AuditAction;
  performedBy: string; // Entra object ID
  performedByRole: AuditRole;
  details: Record<string, unknown>;
  timestamp: string;
  ipAddress: string | null;
}
