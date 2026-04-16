/**
 * Raksha API — Notification Dispatcher
 *
 * The bridge between orchestration config and actual delivery.
 *
 * Given a notification key + tenant context, this module:
 *   1. Loads the notification definition from orchestration config
 *   2. Resolves audience keys → concrete contacts via iccConfig
 *   3. Renders templates with variable substitution
 *   4. Dispatches to the right channel (email / bot / teams_activity)
 *
 * Used by the sendNotification durable activity.
 */

import orchestrationConfig, {
  renderTemplate,
  getNotification,
  type NotificationDefinition,
  type EmailTemplate,
  type BotTemplate,
} from "./orchestrationConfig";
import { sendEmail, type EmailRecipient } from "./graphEmailSender";
import {
  sendActivityFeedNotification,
  type ActivityType,
} from "./activityFeedSender";
import { iccConfig } from "./cosmosClient";

// ============================================================================
// Types
// ============================================================================

/** Resolved contact ready for delivery */
export interface ResolvedRecipient {
  name: string;
  email: string;
  channel: "email" | "bot" | "teams_activity";
  userId?: string; // Entra object ID — needed for bot proactive + teams_activity
}

/** Minimal ICC config shape (avoids importing from bot's models) */
interface IccMember {
  userId: string;
  name: string;
  email: string;
  role: "presiding_officer" | "member" | "external_member";
  isActive: boolean;
}

interface EscContact {
  level: number;
  name: string;
  email: string;
}

interface IccDoc {
  tenantId: string;
  iccMembers: IccMember[];
  escalationContacts: EscContact[];
  settings: {
    nodalOfficerEmail: string;
    [key: string]: unknown;
  };
}

/** Complainant context — comes from the complaint record, not iccConfig */
export interface ComplainantInfo {
  name: string;
  email: string;
  userId: string; // Entra object ID (complainantId)
}

/** Input to dispatch a notification */
export interface DispatchInput {
  /** Notification definition key from orchestration.config.json */
  notificationKey: string;
  /** Tenant ID to load iccConfig */
  tenantId: string;
  /** Template variables (complaintNumber, deadlineDays, etc.) */
  templateVars: Record<string, string | number>;
  /** Complainant info — required if any recipient has audience "complainant" */
  complainant?: ComplainantInfo;
}

/** Result of dispatching a notification */
export interface DispatchResult {
  notificationKey: string;
  emailsSent: number;
  botMessagesSent: number;
  activityNotificationsSent: number;
  errors: string[];
}

// ============================================================================
// Audience Resolver
// ============================================================================

export function resolveAudience(
  audience: string,
  channel: "email" | "bot" | "teams_activity",
  icc: IccDoc,
  complainant?: ComplainantInfo,
): ResolvedRecipient[] {
  switch (audience) {
    case "icc_presiding_officer": {
      const po = icc.iccMembers.find(
        (m) => m.role === "presiding_officer" && m.isActive,
      );
      return po
        ? [{ name: po.name, email: po.email, channel, userId: po.userId }]
        : [];
    }

    case "icc_all_members":
      return icc.iccMembers
        .filter((m) => m.isActive)
        .map((m) => ({ name: m.name, email: m.email, channel, userId: m.userId }));

    case "escalation_contacts_level_1":
      return icc.escalationContacts
        .filter((c) => c.level === 1)
        .map((c) => ({ name: c.name, email: c.email, channel }));

    case "escalation_contacts_level_2":
      return icc.escalationContacts
        .filter((c) => c.level === 2)
        .map((c) => ({ name: c.name, email: c.email, channel }));

    case "nodal_officer":
      return icc.settings.nodalOfficerEmail
        ? [{ name: "Nodal Officer", email: icc.settings.nodalOfficerEmail, channel }]
        : [];

    case "complainant":
      return complainant
        ? [{ name: complainant.name, email: complainant.email, channel, userId: complainant.userId }]
        : [];

    default:
      console.warn(`[notificationDispatcher] Unknown audience key: "${audience}"`);
      return [];
  }
}

// ============================================================================
// ICC Config Loader
// ============================================================================

async function loadIccConfig(tenantId: string): Promise<IccDoc> {
  const { resources } = await iccConfig()
    .items.query({
      query: "SELECT * FROM c WHERE c.tenantId = @tenantId",
      parameters: [{ name: "@tenantId", value: tenantId }],
    })
    .fetchAll();

  if (!resources || resources.length === 0) {
    throw new Error(`[notificationDispatcher] No iccConfig found for tenant ${tenantId}`);
  }

  return resources[0] as IccDoc;
}

// ============================================================================
// Dispatcher
// ============================================================================

/**
 * Dispatch a notification: resolve audiences, render templates, send via channels.
 *
 * Email is sent immediately via Graph API.
 * Bot proactive messages are sent via HTTP to the bot's /api/proactive endpoint (TODO).
 * teams_activity notifications are sent via Graph TeamsActivity.Send (TODO).
 */
export async function dispatchNotification(
  input: DispatchInput,
): Promise<DispatchResult> {
  const result: DispatchResult = {
    notificationKey: input.notificationKey,
    emailsSent: 0,
    botMessagesSent: 0,
    activityNotificationsSent: 0,
    errors: [],
  };

  // 1. Load notification definition
  const def = getNotification(input.notificationKey);

  // 2. Load iccConfig for this tenant
  let icc: IccDoc;
  try {
    icc = await loadIccConfig(input.tenantId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(msg);
    return result;
  }

  // 3. Resolve recipients and dispatch per channel
  for (const recipientDef of def.recipients) {
    // Check if channel is enabled
    const channelConfig = orchestrationConfig.notifications.channels[recipientDef.channel];
    if (channelConfig && !channelConfig.enabled) {
      console.log(
        `[notificationDispatcher] Channel "${recipientDef.channel}" is disabled — skipping`,
      );
      continue;
    }

    const resolved = resolveAudience(
      recipientDef.audience,
      recipientDef.channel,
      icc,
      input.complainant,
    );

    if (resolved.length === 0) {
      console.warn(
        `[notificationDispatcher] No recipients resolved for audience "${recipientDef.audience}"`,
      );
      continue;
    }

    const template = def.templates[recipientDef.audience];
    if (!template) {
      result.errors.push(`Missing template for audience "${recipientDef.audience}"`);
      continue;
    }

    // --- Dispatch by channel ---
    switch (recipientDef.channel) {
      case "email": {
        const emailTmpl = template as EmailTemplate;
        const subject = renderTemplate(emailTmpl.subject, input.templateVars);
        const body = renderTemplate(emailTmpl.body, input.templateVars);

        const emailResult = await sendEmail({
          to: resolved.map((r) => ({ email: r.email, name: r.name })),
          subject,
          body,
        });

        if (emailResult.success) {
          result.emailsSent += emailResult.recipientCount;
        } else {
          result.errors.push(emailResult.error || "Email send failed");
        }
        break;
      }

      case "bot": {
        const botTmpl = template as BotTemplate;
        const message = renderTemplate(botTmpl.message, input.templateVars);

        // Send via bot's /api/proactive endpoint.
        // Uses userId + tenantId so the bot can create a conversation
        // on the fly (same mechanism as Power Automate). No prior
        // interaction required.
        const botBaseUrl = process.env.BOT_BASE_URL || "http://localhost:3978";
        for (const recipient of resolved) {
          if (!recipient.userId) {
            result.errors.push(`Bot channel: missing userId for ${recipient.email}`);
            continue;
          }

          try {
            const resp = await fetch(`${botBaseUrl}/api/proactive`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userId: recipient.userId,
                tenantId: input.tenantId,
                message,
              }),
            });

            if (resp.ok) {
              result.botMessagesSent++;
            } else {
              const errText = await resp.text();
              result.errors.push(`Bot proactive failed (${resp.status}): ${errText}`);
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            result.errors.push(`Bot proactive error: ${msg}`);
          }
        }
        break;
      }

      case "teams_activity": {
        // Send via Graph API TeamsActivity.Send
        const botTmpl = template as BotTemplate;
        const message = renderTemplate(botTmpl.message, input.templateVars);

        // Determine activity type from notification key
        const activityType = resolveActivityType(input.notificationKey);

        for (const recipient of resolved) {
          if (!recipient.userId) {
            result.errors.push(`Activity feed: missing userId for ${recipient.email}`);
            continue;
          }

          try {
            const feedResult = await sendActivityFeedNotification({
              userId: recipient.userId,
              activityType,
              previewText: message.substring(0, 150),
              templateParameters: resolveActivityTemplateParams(activityType, message),
            });

            if (feedResult.success) {
              result.activityNotificationsSent++;
            } else {
              result.errors.push(feedResult.error || "Activity feed send failed");
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            result.errors.push(`Activity feed error: ${msg}`);
          }
        }
        break;
      }
    }
  }

  console.log(
    `[notificationDispatcher] "${input.notificationKey}": ${result.emailsSent} emails, ${result.botMessagesSent} bot msgs, ${result.activityNotificationsSent} activity notifs, ${result.errors.length} errors`,
  );

  return result;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Map notification key → activity type for Teams activity feed.
 * Activity types must match appPackage/manifest.json → activities.activityTypes[].type
 */
function resolveActivityType(notificationKey: string): ActivityType {
  if (notificationKey.includes("escalat")) return "escalationAlert";
  if (notificationKey.includes("reminder") || notificationKey.includes("deadline")) return "deadlineReminder";
  return "complaintUpdate";
}

/**
 * Build template parameters for activity feed.
 * Parameter names must match {placeholders} in manifest templateText.
 */
function resolveActivityTemplateParams(
  activityType: ActivityType,
  message: string,
): Record<string, string> {
  switch (activityType) {
    case "complaintUpdate":
      return { statusUpdate: message };
    case "escalationAlert":
      return { escalationMessage: message };
    case "deadlineReminder":
      return { reminderMessage: message };
  }
}
