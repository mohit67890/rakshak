/**
 * Raksha API — Activity: Update Status
 *
 * Updates a complaint document in Cosmos DB.
 * Used by orchestrators to set status, PDF URLs, deadlines, etc.
 */

import * as df from "durable-functions";
import { complaints } from "../../shared/cosmosClient";
import type { UpdateStatusInput, Complaint } from "../../shared/types";

df.app.activity("updateStatus", {
  handler: async (input: UpdateStatusInput): Promise<{ success: boolean }> => {
    const { complaintId, tenantId, updates } = input;

    const { resource, etag } = await complaints().item(complaintId, tenantId).read<Complaint>();
    if (!resource) {
      throw new Error(`Complaint ${complaintId} not found`);
    }

    const merged: Complaint = {
      ...resource,
      ...updates,
      updatedAt: new Date().toISOString(),
      version: resource.version + 1,
    };

    await complaints().item(complaintId, tenantId).replace(merged, {
      accessCondition: etag ? { type: "IfMatch", condition: etag } : undefined,
    });
    console.log(`[raksha-api] Updated complaint ${complaintId}: ${JSON.stringify(Object.keys(updates))}`);

    return { success: true };
  },
});
