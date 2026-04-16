/**
 * Raksha API — Activity: Fetch Complaint
 *
 * Reads essential complaint data from Cosmos DB for use by orchestrators.
 * Called at the start of complaintLifecycle to populate complainant info,
 * complaintNumber, and other data that the orchestrator needs but doesn't
 * receive in its minimal input ({ complaintId, tenantId }).
 */

import * as df from "durable-functions";
import { complaints } from "../../shared/cosmosClient";
import type {
  FetchComplaintInput,
  FetchComplaintResult,
  Complaint,
} from "../../shared/types";

df.app.activity("fetchComplaint", {
  handler: async (
    input: FetchComplaintInput,
  ): Promise<FetchComplaintResult> => {
    const { complaintId, tenantId } = input;

    const { resource } = await complaints()
      .item(complaintId, tenantId)
      .read<Complaint>();

    if (!resource) {
      throw new Error(
        `[fetchComplaint] Complaint ${complaintId} not found in tenant ${tenantId}`,
      );
    }

    return {
      complaintNumber: resource.complaintNumber,
      complainantName: resource.complainantName,
      complainantId: resource.complainantId,
      category: resource.category,
      severity: resource.severity,
      isCriminalThreshold: resource.isCriminalThreshold,
      escalationLevel: resource.escalationLevel,
    };
  },
});
