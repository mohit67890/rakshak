/**
 * Raksha API — Graph Email Sender
 *
 * Sends emails via Microsoft Graph API using app-only authentication.
 * Uses ClientSecretCredential → POST /users/{sender}/sendMail.
 *
 * Required Entra app registration permissions:
 *   - Mail.Send (Application) — allows sending mail as any user in the tenant
 *
 * Required env vars:
 *   - GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, GRAPH_TENANT_ID
 *   - GRAPH_SENDER_EMAIL — the mailbox to send from (e.g. raksha@acme.com or a shared mailbox)
 */

import { ClientSecretCredential } from "@azure/identity";
import config from "./config";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const GRAPH_SCOPE = "https://graph.microsoft.com/.default";

export interface EmailRecipient {
  email: string;
  name?: string;
}

export interface SendEmailInput {
  to: EmailRecipient[];
  subject: string;
  body: string;
  /** HTML or Text. Default: Text */
  contentType?: "Text" | "HTML";
}

export interface SendEmailResult {
  success: boolean;
  recipientCount: number;
  error?: string;
}

/** Lazy-initialized credential — created once, reused across calls */
let credential: ClientSecretCredential | null = null;

function getCredential(): ClientSecretCredential {
  if (!credential) {
    const { clientId, clientSecret, tenantId } = config.graph;
    if (!clientId || !clientSecret || !tenantId) {
      throw new Error(
        "[graphEmailSender] Missing GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, or GRAPH_TENANT_ID",
      );
    }
    credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
  }
  return credential;
}

async function getAccessToken(): Promise<string> {
  const tokenResponse = await getCredential().getToken(GRAPH_SCOPE);
  return tokenResponse.token;
}

/**
 * Send an email via Graph API POST /users/{sender}/sendMail.
 *
 * The sender is configured via GRAPH_SENDER_EMAIL env var.
 * This should be a shared mailbox or a service account.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const { senderEmail } = config.graph;
  if (!senderEmail) {
    console.warn("[graphEmailSender] GRAPH_SENDER_EMAIL not configured — skipping email send");
    return { success: false, recipientCount: 0, error: "GRAPH_SENDER_EMAIL not configured" };
  }

  if (input.to.length === 0) {
    return { success: true, recipientCount: 0 };
  }

  const token = await getAccessToken();

  const mailPayload = {
    message: {
      subject: input.subject,
      body: {
        contentType: input.contentType || "Text",
        content: input.body,
      },
      toRecipients: input.to.map((r) => ({
        emailAddress: {
          address: r.email,
          name: r.name,
        },
      })),
    },
    saveToSentItems: false,
  };

  const url = `${GRAPH_BASE}/users/${encodeURIComponent(senderEmail)}/sendMail`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(mailPayload),
  });

  if (response.status === 202 || response.ok) {
    console.log(
      `[graphEmailSender] Sent email to ${input.to.length} recipient(s): "${input.subject}"`,
    );
    return { success: true, recipientCount: input.to.length };
  }

  const errorBody = await response.text();
  console.error(
    `[graphEmailSender] Graph API error ${response.status}: ${errorBody}`,
  );
  return {
    success: false,
    recipientCount: 0,
    error: `Graph API ${response.status}: ${errorBody}`,
  };
}

/** Reset credential — useful for testing */
export function _resetCredential(): void {
  credential = null;
}
