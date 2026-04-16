/**
 * Raksha API — Orchestration Configuration Schema + Loader
 *
 * Single source of truth for all orchestration behavior:
 * escalation chains, reminders, deadlines, notification routing and templates.
 *
 * To change how the backend works, edit orchestration.config.json.
 * This module validates the config at startup and provides typed access.
 */

import rawConfig from "../orchestration.config.json";

// ============================================================================
// Schema Types
// ============================================================================

export interface EscalationLevel {
  /** Numeric level: 0 = ICC reminder, 1 = Audit Committee, 2 = District Officer */
  level: number;
  name: string;
  description: string;
  /** Days to wait after the previous level before triggering this one */
  waitDaysAfterPrevious: number;
  /** "remind_icc" just nudges, "escalate" promotes to next authority */
  action: "remind_icc" | "escalate";
  /** Notification definition keys to fire when this level triggers */
  notifications: string[];
}

export interface InquiryReminder {
  /** Day offset from inquiry start */
  dayOffset: number;
  /** Notification definition key */
  notification: string;
  urgency: "normal" | "high" | "critical";
}

/** Who receives a notification and via which channel */
export interface NotificationRecipient {
  /**
   * Audience key — resolved at runtime from the tenant's iccConfig:
   *   "icc_presiding_officer"    → presiding officer from iccConfig.iccMembers
   *   "icc_all_members"          → all active iccConfig.iccMembers
   *   "complainant"              → complainant via bot proactive message
   *   "escalation_contacts_level_1" → iccConfig.escalationContacts where level=1
   *   "escalation_contacts_level_2" → iccConfig.escalationContacts where level=2
   *   "nodal_officer"            → iccConfig.settings.nodalOfficerEmail
   */
  audience: string;
  channel: "email" | "bot" | "teams_activity";
}

/** Template for a specific audience within a notification definition */
export interface EmailTemplate {
  subject: string;
  body: string;
}

export interface BotTemplate {
  message: string;
}

/**
 * A notification definition: who gets what, via which channel,
 * with which template — all in one place.
 */
export interface NotificationDefinition {
  description: string;
  recipients: NotificationRecipient[];
  templates: Record<string, EmailTemplate | BotTemplate>;
}

export interface NotificationChannel {
  enabled: boolean;
  senderDisplayName?: string;
  description: string;
}

export interface OrchestrationConfig {
  acknowledgement: {
    deadlineDays: number;
    description: string;
  };

  escalation: {
    enabled: boolean;
    levels: EscalationLevel[];
  };

  inquiry: {
    deadlineDays: number;
    reminders: InquiryReminder[];
    onBreach: {
      notifications: string[];
    };
    description: string;
  };

  orchestration: {
    startTimeoutMs: number;
    dailyCheckCron: string;
    description: string;
  };

  notifications: {
    channels: Record<string, NotificationChannel>;
    definitions: Record<string, NotificationDefinition>;
  };
}

// ============================================================================
// Validation
// ============================================================================

function validate(cfg: OrchestrationConfig): void {
  if (cfg.acknowledgement.deadlineDays < 1) {
    throw new Error("[orchestration.config] acknowledgement.deadlineDays must be >= 1");
  }
  if (cfg.inquiry.deadlineDays < 1) {
    throw new Error("[orchestration.config] inquiry.deadlineDays must be >= 1");
  }
  if (cfg.escalation.levels.length === 0) {
    throw new Error("[orchestration.config] escalation.levels must have at least one level");
  }
  for (const level of cfg.escalation.levels) {
    if (level.waitDaysAfterPrevious < 0) {
      throw new Error(`[orchestration.config] escalation level ${level.level} waitDays must be >= 0`);
    }
    // Verify referenced notification definitions exist
    for (const notifKey of level.notifications) {
      if (!cfg.notifications.definitions[notifKey]) {
        throw new Error(`[orchestration.config] escalation level ${level.level} references unknown notification "${notifKey}"`);
      }
    }
  }
  for (const reminder of cfg.inquiry.reminders) {
    if (reminder.dayOffset < 1 || reminder.dayOffset > cfg.inquiry.deadlineDays) {
      throw new Error(`[orchestration.config] inquiry reminder dayOffset ${reminder.dayOffset} out of range [1, ${cfg.inquiry.deadlineDays}]`);
    }
    if (!cfg.notifications.definitions[reminder.notification]) {
      throw new Error(`[orchestration.config] inquiry reminder references unknown notification "${reminder.notification}"`);
    }
  }
  for (const notifKey of cfg.inquiry.onBreach.notifications) {
    if (!cfg.notifications.definitions[notifKey]) {
      throw new Error(`[orchestration.config] inquiry.onBreach references unknown notification "${notifKey}"`);
    }
  }
  if (cfg.orchestration.startTimeoutMs < 1000) {
    throw new Error("[orchestration.config] orchestration.startTimeoutMs must be >= 1000");
  }
}

// ============================================================================
// Template Engine
// ============================================================================

/**
 * Replace {{variable}} placeholders in a notification template.
 *
 *   renderTemplate("Hello {{name}}, deadline is {{deadlineDays}} days", {
 *     name: "ICC",
 *     deadlineDays: 7,
 *   })
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    return key in vars ? String(vars[key]) : `{{${key}}}`;
  });
}

/**
 * Get a notification definition by key. Throws if not found.
 */
export function getNotification(key: string): NotificationDefinition {
  const def = orchestrationConfig.notifications.definitions[key];
  if (!def) throw new Error(`[orchestration.config] Unknown notification: "${key}"`);
  return def;
}

// ============================================================================
// Export validated config singleton
// ============================================================================

const orchestrationConfig: OrchestrationConfig = rawConfig as OrchestrationConfig;
validate(orchestrationConfig);

export default orchestrationConfig;
