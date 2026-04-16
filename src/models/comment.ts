/**
 * Raksha — Comment Model
 *
 * Comments on complaints — posted by employees or ICC members.
 * Stored in the "comments" Cosmos container, partitioned by complaintId.
 */

import type { BaseDocument } from "../database/types";

export interface Comment extends BaseDocument {
  id: string;
  complaintId: string;   // Partition key
  tenantId: string;
  authorId: string;      // Entra object ID
  authorName: string;
  authorRole: "employee" | "icc";
  content: string;
  createdAt: string;
}
