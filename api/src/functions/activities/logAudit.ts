/**
 * Raksha API — Activity: Log Audit
 *
 * Writes an immutable audit log entry to the auditLogs container.
 * Audit logs are append-only — never updated or deleted.
 */

import * as df from "durable-functions";
import { v4 as uuid } from "uuid";
import { auditLogs } from "../../shared/cosmosClient";
import type { LogAuditInput, AuditLog } from "../../shared/types";

df.app.activity("logAudit", {
  handler: async (input: LogAuditInput): Promise<{ success: boolean }> => {
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

    await auditLogs().items.create(entry);
    console.log(`[raksha-api] Audit: ${input.action} on ${input.complaintId}`);

    return { success: true };
  },
});
