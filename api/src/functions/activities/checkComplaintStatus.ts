/**
 * Raksha API — Activity: Check Complaint Status
 *
 * Reads the current complaint status from Cosmos DB.
 * Used by escalationChain and inquiryDeadline orchestrators to
 * self-terminate when the complaint has already been acted on.
 *
 * This is the critical correctness mechanism — without it, sub-orchestrators
 * would keep escalating even after ICC acknowledges.
 */

import * as df from "durable-functions";
import { complaints } from "../../shared/cosmosClient";
import type {
  CheckComplaintStatusInput,
  CheckComplaintStatusResult,
  Complaint,
} from "../../shared/types";

df.app.activity("checkComplaintStatus", {
  handler: async (
    input: CheckComplaintStatusInput,
  ): Promise<CheckComplaintStatusResult> => {
    const { complaintId, tenantId } = input;

    const { resource } = await complaints()
      .item(complaintId, tenantId)
      .read<Complaint>();

    if (!resource) {
      throw new Error(
        `[checkComplaintStatus] Complaint ${complaintId} not found`,
      );
    }

    return {
      status: resource.status,
      escalationLevel: resource.escalationLevel,
      acknowledgedAt: resource.acknowledgedAt,
      resolvedAt: resource.resolvedAt,
    };
  },
});
