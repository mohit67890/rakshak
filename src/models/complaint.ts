/**
 * Raksha — Complaint Model
 *
 * Cosmos DB container: "complaints"
 * Partition key: /tenantId
 */

import type { BaseDocument } from "../database/types";

export type ComplaintStatus =
  | "draft"
  | "submitted"
  | "acknowledged"
  | "under_inquiry"
  | "resolved"
  | "escalated"
  | "closed";

export type ComplaintSeverity = "low" | "medium" | "high" | "criminal";

export type ComplaintCategory =
  | "sexual_harassment"
  | "verbal_abuse"
  | "physical_contact"
  | "quid_pro_quo"
  | "hostile_environment"
  | "religious_harassment"
  | "other";

export interface AccusedPerson {
  name: string;
  designation: string;
  department: string;
  relationship: string; // team_lead, peer, subordinate, external
}

export interface Witness {
  name: string;
  designation: string;
}

export interface Complaint extends BaseDocument {
  id: string;
  tenantId: string;
  complainantId: string;
  complainantName: string; // Encrypted
  complaintNumber: string; // Human-readable: RKSH-YYYYMM-XXXX
  status: ComplaintStatus;
  severity: ComplaintSeverity;
  category: ComplaintCategory;

  // Incident details (encrypted at field level)
  incidentDate: string;
  incidentLocation: string;
  description: string;
  accusedPersons: AccusedPerson[];
  witnesses: Witness[];
  evidenceUrls: string[];

  // Legal classification
  poshSections: string[];
  bnsSections: string[];
  isCriminalThreshold: boolean;

  // Routing
  assignedIccId: string | null;
  escalationLevel: number; // 0=ICC, 1=Audit Committee, 2=District Officer

  // Lifecycle
  submittedAt: string;
  acknowledgedAt: string | null;
  acknowledgeDeadline: string;
  inquiryStartedAt: string | null;
  inquiryDeadline: string;
  resolvedAt: string | null;
  resolution: string | null;

  // Complainant-initiated appeal to higher authority
  // (separate from system-driven auto-escalation on ICC inaction)
  appealStatus: "none" | "pending" | "under_review" | "upheld" | "rejected";
  appealedAt: string | null;
  appealReason: string | null;
  appealedToLevel: number | null; // 1=Audit Committee, 2=District Officer
  appealReviewedAt: string | null;
  appealOutcome: string | null;

  // Conversation
  conversationId: string;
  complaintPdfUrl: string | null;

  // Metadata
  createdAt: string;
  updatedAt: string;
  version: number;
}
