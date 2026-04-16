/**
 * Raksha — Bot-Side Audit Service
 *
 * Writes immutable audit log entries to the auditLogs Cosmos container
 * for bot-side actions that don't flow through the API orchestration layer.
 *
 * Covers:
 *   - Draft complaint created
 *   - Complaint submitted (bot-side, before orchestration starts)
 *
 * Audit logs are append-only — never updated or deleted.
 */

import { v4 as uuid } from "uuid";
import { getRakshaContainers } from "../utils/cosmosClient";
import type { AuditAction, AuditRole, AuditLog } from "../models/auditLog";

export interface WriteAuditInput {
  complaintId: string;
  tenantId: string;
  action: AuditAction;
  performedBy: string;
  performedByRole: AuditRole;
  details?: Record<string, unknown>;
}

/**
 * Write an audit log entry to Cosmos DB.
 *
 * Fire-and-forget safe: callers should catch errors to avoid
 * blocking the user's conversation flow. Audit failures should
 * never prevent the user from filing a complaint.
 */
export async function writeAudit(input: WriteAuditInput): Promise<void> {
  const { auditLogs } = await getRakshaContainers();

  const entry: AuditLog = {
    id: uuid(),
    tenantId: input.tenantId,
    complaintId: input.complaintId,
    action: input.action,
    performedBy: input.performedBy,
    performedByRole: input.performedByRole,
    details: input.details ?? {},
    timestamp: new Date().toISOString(),
    ipAddress: null,
  };

  await auditLogs.create(entry);
  console.log(`[raksha] Audit: ${input.action} on ${input.complaintId}`);
}
