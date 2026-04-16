/**
 * Raksha API — HTTP Trigger: Comments
 *
 * GET  /api/complaints/{complaintId}/comments — List comments
 * POST /api/complaints/{complaintId}/comments — Add a comment
 *
 * Combined into a single registration because Azure Functions v4
 * requires unique routes — two app.http() calls on the same route conflict.
 */

import { app, type HttpRequest, type HttpResponse, type InvocationContext } from "@azure/functions";
import { v4 as uuid } from "uuid";
import { complaints, comments, auditLogs } from "../../shared/cosmosClient";

app.http("comments", {
  methods: ["GET", "POST"],
  authLevel: "anonymous", // TODO: Add Entra ID token validation
  route: "complaints/{complaintId}/comments",
  handler: async (req: HttpRequest, _context: InvocationContext): Promise<HttpResponse> => {
    if (req.method === "GET") {
      return handleGetComments(req);
    }
    return handleAddComment(req);
  },
});

// ============================================================================
// GET — List comments for a complaint
// ============================================================================

async function handleGetComments(req: HttpRequest): Promise<HttpResponse> {
  const complaintId = req.params.complaintId;
  const tenantId = req.query.get("tenantId");
  const userId = req.query.get("userId");
  const role = req.query.get("role") ?? "employee";

  if (!complaintId || !tenantId || !userId) {
    return jsonResponse(400, { error: "complaintId, tenantId, and userId are required" });
  }

  try {
    // Verify access — employee can only see own complaints
    if (role === "employee") {
      const { resource: complaint } = await complaints()
        .item(complaintId, tenantId)
        .read();

      if (!complaint) {
        return jsonResponse(404, { error: "Complaint not found" });
      }

      if (complaint.complainantId !== userId) {
        return jsonResponse(403, { error: "Access denied" });
      }
    }

    // Fetch comments ordered by creation time
    const { resources } = await comments()
      .items.query(
        {
          query: "SELECT * FROM c WHERE c.complaintId = @complaintId ORDER BY c.createdAt ASC",
          parameters: [{ name: "@complaintId", value: complaintId }],
        },
        { partitionKey: complaintId },
      )
      .fetchAll();

    // Strip Cosmos internal fields
    const cleaned = resources.map(
      ({ _rid, _self, _etag, _attachments, _ts, ...rest }: Record<string, unknown>) => rest,
    );

    return jsonResponse(200, { comments: cleaned });
  } catch (err) {
    return jsonResponse(500, { error: "Failed to fetch comments", details: (err as Error).message });
  }
}

// ============================================================================
// POST — Add a comment to a complaint
// ============================================================================

interface AddCommentBody {
  tenantId: string;
  userId: string;
  userName: string;
  role: "employee" | "icc";
  content: string;
}

async function handleAddComment(req: HttpRequest): Promise<HttpResponse> {
  const complaintId = req.params.complaintId;

  let body: AddCommentBody;
  try {
    body = (await req.json()) as AddCommentBody;
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const { tenantId, userId, userName, role, content } = body;

  if (!complaintId || !tenantId || !userId || !userName || !role || !content?.trim()) {
    return jsonResponse(400, { error: "complaintId, tenantId, userId, userName, role, and content are required" });
  }

  if (content.trim().length > 5000) {
    return jsonResponse(400, { error: "Comment is too long (max 5000 characters)" });
  }

  try {
    // Verify the complaint exists and check access
    const { resource: complaint } = await complaints()
      .item(complaintId, tenantId)
      .read();

    if (!complaint) {
      return jsonResponse(404, { error: "Complaint not found" });
    }

    if (role === "employee" && complaint.complainantId !== userId) {
      return jsonResponse(403, { error: "Access denied" });
    }

    // Don't allow comments on draft complaints
    if (complaint.status === "draft") {
      return jsonResponse(400, { error: "Cannot comment on draft complaints" });
    }

    // Create the comment
    const now = new Date().toISOString();
    const comment = {
      id: uuid(),
      complaintId,
      tenantId,
      authorId: userId,
      authorName: userName,
      authorRole: role,
      content: content.trim(),
      createdAt: now,
    };

    await comments().items.create(comment);

    // Audit log
    await auditLogs().items.create({
      id: uuid(),
      tenantId,
      complaintId,
      action: "comment_added",
      performedBy: userId,
      performedByRole: role,
      details: { commentId: comment.id },
      timestamp: now,
    });

    return jsonResponse(201, { comment });
  } catch (err) {
    return jsonResponse(500, { error: "Failed to add comment", details: (err as Error).message });
  }
}

// ============================================================================
// Helpers
// ============================================================================

function jsonResponse(status: number, body: unknown): HttpResponse {
  return new Response(
    JSON.stringify(body),
    { status, headers: { "Content-Type": "application/json" } },
  ) as unknown as HttpResponse;
}
