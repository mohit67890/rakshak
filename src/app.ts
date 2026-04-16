import { TokenCredentials, type ActivityLike, TypingActivity } from "@microsoft/teams.api";
import { App } from "@microsoft/teams.apps";
import { LocalStorage } from "@microsoft/teams.common";
import path from "path";
import config from "./config";
import { ManagedIdentityCredential } from "@azure/identity";
import { handleMessage, handleCardAction, type TeamsAttachment } from "./conversations/router";
import { buildWelcomeCard } from "./cards/welcomeCard";

// Register flow handlers (side-effect imports)
import "./conversations/welcomeFlow";
import "./conversations/listeningFlow";

// LocalStorage used by the SDK for its internal state (not complaint data)
const storage = new LocalStorage();

const createTokenFactory = () => {
  return async (scope: string | string[], tenantId?: string): Promise<string> => {
    const managedIdentityCredential = new ManagedIdentityCredential({
      clientId: process.env.CLIENT_ID,
    });
    const scopes = Array.isArray(scope) ? scope : [scope];
    const tokenResponse = await managedIdentityCredential.getToken(scopes, {
      tenantId: tenantId,
    });

    return tokenResponse.token;
  };
};

const tokenCredentials: TokenCredentials = {
  clientId: process.env.CLIENT_ID || "",
  token: createTokenFactory(),
};

const credentialOptions =
  config.MicrosoftAppType === "UserAssignedMsi" ? { ...tokenCredentials } : undefined;

const app = new App({
  ...credentialOptions,
  storage,
});

// ============================================================================
// Bot Handlers — Routed through conversation state machine
// ============================================================================

app.on("message", async (context) => {
  const visitorId = context.activity.from?.aadObjectId || context.activity.from?.id || "unknown";
  const tenantId = context.activity.conversation?.tenantId || "unknown";
  const text = (context.activity.text || "").trim();
  const teamsConversationId = context.activity.conversation?.id;

  // Extract file attachments from the Teams message
  const attachments: TeamsAttachment[] = [];
  if (context.activity.attachments) {
    for (const att of context.activity.attachments) {
      // Skip Adaptive Card attachments — those are card renders, not user files
      if (att.contentType === "application/vnd.microsoft.card.adaptive") continue;

      // Teams file download info
      const downloadUrl =
        att.content?.downloadUrl || // Standard Teams file attachment
        att.contentUrl ||           // Direct content URL
        undefined;

      if (downloadUrl && att.name) {
        attachments.push({
          name: att.name,
          contentType: att.content?.fileType
            ? mimeFromExtension(att.name)
            : att.contentType || "application/octet-stream",
          downloadUrl,
          sizeBytes: att.content?.fileSizeInBytes,
        });
      }
    }
  }

  await handleMessage({
    visitorId,
    tenantId,
    text,
    teamsConversationId,
    attachments: attachments.length > 0 ? attachments : undefined,
    send: async (msg) => { await context.send(msg as ActivityLike); },
    sendTyping: async () => { await context.send(new TypingActivity()); },
    streamEmit: (chunk) => { context.stream.emit(chunk); },
    streamUpdate: (status) => { context.stream.update(status); },
    streamClose: async () => { await context.stream.close(); },
  });
});

app.on("card.action", async (context) => {
  const visitorId = context.activity.from?.aadObjectId || context.activity.from?.id || "unknown";
  const tenantId = context.activity.conversation?.tenantId || "unknown";
  const actionData = context.activity.value?.action?.data || {};
  const verb = context.activity.value?.action?.verb || "";
  const teamsConversationId = context.activity.conversation?.id;

  await handleCardAction({
    visitorId,
    tenantId,
    text: verb,
    teamsConversationId,
    actionData: actionData as Record<string, unknown>,
    verb,
    send: async (msg) => { await context.send(msg as ActivityLike); },
    sendTyping: async () => { await context.send(new TypingActivity()); },
    streamEmit: (chunk) => { context.stream.emit(chunk); },
    streamUpdate: (status) => { context.stream.update(status); },
    streamClose: async () => { await context.stream.close(); },
  });

  return { statusCode: 200, type: "application/vnd.microsoft.activity.message", value: "" };
});

app.on("install.add", async (context) => {
  await context.send(buildWelcomeCard());
});

// ============================================================================
// Proactive Messaging Endpoint
// ============================================================================

/**
 * POST /api/proactive — Send a proactive message to a user.
 *
 * Called by the API (Azure Functions) notification dispatcher when
 * a notification needs to be delivered as an in-chat bot message.
 *
 * Accepts TWO modes:
 *
 * 1. By userId (preferred — works even without prior conversation):
 *    { userId: string, tenantId: string, message: string }
 *    → Creates a new 1:1 conversation via Bot Framework Connector API,
 *      then sends the message. Same mechanism Power Automate uses.
 *
 * 2. By conversationId (direct, if already known):
 *    { conversationId: string, message: string }
 *    → Sends to an existing conversation directly.
 */
app.server.registerRoute("POST", "/api/proactive", async (request) => {
  try {
    const body = request.body as {
      userId?: string;
      tenantId?: string;
      conversationId?: string;
      message?: string;
    };

    if (!body?.message) {
      return { status: 400, body: { error: "Missing required field: message" } };
    }

    let conversationId = body.conversationId;

    // Mode 1: Create conversation from userId (like Power Automate does)
    if (!conversationId && body.userId) {
      const convResource = await app.api.conversations.create({
        isGroup: false,
        tenantId: body.tenantId,
        members: [
          { id: body.userId, name: "", role: "user" },
        ],
        channelData: body.tenantId
          ? { tenant: { id: body.tenantId } }
          : undefined,
      });

      conversationId = convResource.id;
      console.log(
        `[proactive] Created conversation ${conversationId} for user ${body.userId}`,
      );
    }

    if (!conversationId) {
      return {
        status: 400,
        body: { error: "Provide either userId+tenantId or conversationId" },
      };
    }

    const result = await app.send(conversationId, {
      type: "message",
      text: body.message,
    });

    console.log(
      `[proactive] Sent message to ${conversationId}: "${body.message.substring(0, 80)}..."`,
    );

    return {
      status: 200,
      body: { success: true, activityId: result?.id, conversationId },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[proactive] Failed to send: ${msg}`);
    return {
      status: 500,
      body: { success: false, error: msg },
    };
  }
});

// ============================================================================
// Tab — Serve built React SPA from /tab/
// ============================================================================

// Serves tab/dist/ as static files. Build the tab first: cd tab && npm run build
// Uses HashRouter, so all SPA routes are handled client-side via # fragment.
app.server.serveStatic("/tab", path.join(__dirname, "..", "tab", "dist"));

// ============================================================================
// API Proxy — Forward /api/* to Azure Functions (port 7071)
// ============================================================================

// The tab's API calls (GET /api/complaints, etc.) hit this server (same origin).
// We proxy them to Azure Functions running locally on port 7071.
// POST /api/* routes (bot messaging, proactive) are handled above and won't
// reach these handlers because Express matches earlier-registered routes first.

const FUNCTIONS_PORT = process.env.FUNCTIONS_PORT || "7071";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adapter = app.server.adapter as any;

function proxyToFunctions(method: string = "GET") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (req: any, res: any) => {
    try {
      const url = `http://localhost:${FUNCTIONS_PORT}${req.originalUrl}`;
      const init: RequestInit = { method };
      if (["PATCH", "POST", "PUT"].includes(method)) {
        init.headers = { "content-type": "application/json" };
        init.body = JSON.stringify(req.body);
      }
      const proxyRes = await fetch(url, init);
      const ct = proxyRes.headers.get("content-type") || "application/json";
      const body = await proxyRes.text();
      res.status(proxyRes.status).set("content-type", ct).send(body);
    } catch {
      res.status(502).json({
        error: `Azure Functions API not available on port ${FUNCTIONS_PORT}. Start it with: cd api && npm start`,
      });
    }
  };
}

if (typeof adapter.get === "function") {
  adapter.get("/api/me", proxyToFunctions());
  adapter.get("/api/complaints", proxyToFunctions());
  adapter.get("/api/complaints/:complaintId", proxyToFunctions());
  adapter.get("/api/icc/dashboard", proxyToFunctions());
  adapter.get("/api/health", proxyToFunctions());
  adapter.patch("/api/complaints/:complaintId/status", proxyToFunctions("PATCH"));
  console.log(`[proxy] API requests will be forwarded to localhost:${FUNCTIONS_PORT}`);
}

// ============================================================================
// Helpers
// ============================================================================

/** Derive MIME type from file extension. Teams sometimes only gives the extension. */
function mimeFromExtension(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
    webp: "image/webp", heic: "image/heic", heif: "image/heif", bmp: "image/bmp",
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    eml: "message/rfc822",
    msg: "application/vnd.ms-outlook",
    txt: "text/plain",
  };
  return map[ext || ""] || "application/octet-stream";
}

export default app;
