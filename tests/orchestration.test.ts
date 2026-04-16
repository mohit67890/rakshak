/**
 * Raksha — Orchestration Config + ICC Config Tests
 *
 * Validates:
 *   1. orchestration.config.json loads, validates, and types correctly
 *   2. Template rendering works with all placeholder patterns
 *   3. Notification definitions are complete and structurally sound
 *   4. Escalation levels reference valid notifications in correct order
 *   5. Inquiry reminders are sorted and within deadline bounds
 *   6. IccConfiguration model can resolve all audience keys from orchestration config
 *   7. Validation catches broken configs
 */

import { describe, it, expect } from "vitest";
import orchestrationConfig, {
  renderTemplate,
  getNotification,
  type OrchestrationConfig,
  type EscalationLevel,
  type NotificationDefinition,
  type NotificationRecipient,
  type EmailTemplate,
  type BotTemplate,
} from "../api/src/shared/orchestrationConfig";
import type {
  IccConfiguration,
  IccMember,
  EscalationContact,
  IccSettings,
} from "../src/models/iccConfig";

// ============================================================================
// Test Fixture: a realistic IccConfiguration document
// ============================================================================

const sampleIccConfig: IccConfiguration = {
  id: "icc-acme-001",
  tenantId: "tenant-acme-corp",
  organizationName: "Acme Corp",
  iccMembers: [
    {
      userId: "user-priya",
      name: "Priya Sharma",
      email: "priya@acme.com",
      role: "presiding_officer",
      gender: "female",
      isActive: true,
    },
    {
      userId: "user-ravi",
      name: "Ravi Kumar",
      email: "ravi@acme.com",
      role: "member",
      gender: "male",
      isActive: true,
    },
    {
      userId: "user-meera",
      name: "Dr. Meera Nair",
      email: "meera@ngo.org",
      role: "external_member",
      gender: "female",
      isActive: true,
    },
    {
      userId: "user-anil",
      name: "Anil Deshmukh",
      email: "anil@acme.com",
      role: "member",
      gender: "male",
      isActive: false, // inactive member — should be excluded from icc_all_members
    },
  ],
  escalationContacts: [
    {
      level: 1,
      name: "Audit Committee Chair",
      email: "audit-chair@acme.com",
      role: "Audit Committee",
    },
    {
      level: 1,
      name: "Audit Committee Member",
      email: "audit-member@acme.com",
      role: "Audit Committee",
    },
    {
      level: 2,
      name: "District Officer, Pune",
      email: "do-pune@gov.in",
      role: "District Officer",
    },
  ],
  settings: {
    acknowledgementDeadlineDays: 7,
    inquiryDeadlineDays: 90,
    autoEscalateOnMiss: true,
    enableAnonymousReporting: true,
    enableCriminalThresholdAlert: true,
    nodalOfficerEmail: "nodal@acme.com",
  },
  createdAt: "2026-01-15T00:00:00Z",
  updatedAt: "2026-04-01T00:00:00Z",
};

// ============================================================================
// Audience Resolver — pure function that maps audience keys → contacts
// This is the bridge between orchestration config and iccConfig.
// ============================================================================

interface ResolvedRecipient {
  name: string;
  email: string;
  channel: "email" | "bot" | "teams_activity";
  userId?: string;
}

/**
 * Resolves an audience key from orchestration config against a tenant's iccConfig.
 * Returns concrete contact info for each resolved recipient.
 */
function resolveAudience(
  audience: string,
  channel: "email" | "bot" | "teams_activity",
  iccConfig: IccConfiguration,
  complainant?: { name: string; email: string; userId: string },
): ResolvedRecipient[] {
  switch (audience) {
    case "icc_presiding_officer": {
      const po = iccConfig.iccMembers.find(
        (m) => m.role === "presiding_officer" && m.isActive,
      );
      return po
        ? [{ name: po.name, email: po.email, channel, userId: po.userId }]
        : [];
    }

    case "icc_all_members": {
      return iccConfig.iccMembers
        .filter((m) => m.isActive)
        .map((m) => ({ name: m.name, email: m.email, channel, userId: m.userId }));
    }

    case "escalation_contacts_level_1": {
      return iccConfig.escalationContacts
        .filter((c) => c.level === 1)
        .map((c) => ({ name: c.name, email: c.email, channel }));
    }

    case "escalation_contacts_level_2": {
      return iccConfig.escalationContacts
        .filter((c) => c.level === 2)
        .map((c) => ({ name: c.name, email: c.email, channel }));
    }

    case "nodal_officer": {
      return iccConfig.settings.nodalOfficerEmail
        ? [
            {
              name: "Nodal Officer",
              email: iccConfig.settings.nodalOfficerEmail,
              channel,
            },
          ]
        : [];
    }

    case "complainant": {
      return complainant
        ? [
            {
              name: complainant.name,
              email: complainant.email,
              channel,
              userId: complainant.userId,
            },
          ]
        : [];
    }

    default:
      return [];
  }
}

/**
 * For a notification definition, resolve all recipients against tenant iccConfig.
 */
function resolveNotification(
  notifDef: NotificationDefinition,
  iccConfig: IccConfiguration,
  complainant?: { name: string; email: string; userId: string },
): ResolvedRecipient[] {
  const resolved: ResolvedRecipient[] = [];
  for (const recipient of notifDef.recipients) {
    resolved.push(
      ...resolveAudience(
        recipient.audience,
        recipient.channel,
        iccConfig,
        complainant,
      ),
    );
  }
  return resolved;
}

// ============================================================================
// 1. Config Structure Validation
// ============================================================================

describe("Orchestration Config — Structure", () => {
  it("loads without validation errors", () => {
    // If the import succeeded and we get here, validation passed
    expect(orchestrationConfig).toBeDefined();
    expect(orchestrationConfig.acknowledgement).toBeDefined();
    expect(orchestrationConfig.escalation).toBeDefined();
    expect(orchestrationConfig.inquiry).toBeDefined();
    expect(orchestrationConfig.orchestration).toBeDefined();
    expect(orchestrationConfig.notifications).toBeDefined();
  });

  it("has all top-level sections", () => {
    const keys = Object.keys(orchestrationConfig);
    expect(keys).toContain("acknowledgement");
    expect(keys).toContain("escalation");
    expect(keys).toContain("inquiry");
    expect(keys).toContain("orchestration");
    expect(keys).toContain("notifications");
  });

  it("acknowledgement deadline is a positive number", () => {
    expect(orchestrationConfig.acknowledgement.deadlineDays).toBeGreaterThanOrEqual(1);
    expect(typeof orchestrationConfig.acknowledgement.deadlineDays).toBe("number");
  });

  it("inquiry deadline is 90 days per POSH Act", () => {
    expect(orchestrationConfig.inquiry.deadlineDays).toBe(90);
  });

  it("orchestration timeout is at least 1 second", () => {
    expect(orchestrationConfig.orchestration.startTimeoutMs).toBeGreaterThanOrEqual(1000);
  });

  it("has email, bot, and teams_activity channels defined", () => {
    expect(orchestrationConfig.notifications.channels.email).toBeDefined();
    expect(orchestrationConfig.notifications.channels.bot).toBeDefined();
    expect(orchestrationConfig.notifications.channels.teams_activity).toBeDefined();
    expect(orchestrationConfig.notifications.channels.email.enabled).toBe(true);
    expect(orchestrationConfig.notifications.channels.bot.enabled).toBe(true);
    expect(orchestrationConfig.notifications.channels.teams_activity.enabled).toBe(false);
  });
});

// ============================================================================
// 2. Escalation Levels
// ============================================================================

describe("Orchestration Config — Escalation Levels", () => {
  const levels = orchestrationConfig.escalation.levels;

  it("has exactly 3 escalation levels", () => {
    expect(levels).toHaveLength(3);
  });

  it("levels are in ascending order (0, 1, 2)", () => {
    expect(levels[0].level).toBe(0);
    expect(levels[1].level).toBe(1);
    expect(levels[2].level).toBe(2);
  });

  it("level 0 is remind_icc action", () => {
    expect(levels[0].action).toBe("remind_icc");
  });

  it("levels 1 and 2 are escalate actions", () => {
    expect(levels[1].action).toBe("escalate");
    expect(levels[2].action).toBe("escalate");
  });

  it("all levels have non-negative wait days", () => {
    for (const level of levels) {
      expect(level.waitDaysAfterPrevious).toBeGreaterThanOrEqual(0);
    }
  });

  it("all levels reference existing notification definitions", () => {
    const definitionKeys = Object.keys(orchestrationConfig.notifications.definitions);
    for (const level of levels) {
      for (const notifKey of level.notifications) {
        expect(definitionKeys).toContain(notifKey);
      }
    }
  });

  it("total escalation timeline computes correctly", () => {
    const totalDays =
      orchestrationConfig.acknowledgement.deadlineDays +
      levels.reduce((sum, l) => sum + l.waitDaysAfterPrevious, 0);
    // 7 (ack) + 0 (reminder) + 3 (audit) + 7 (district) = 17
    expect(totalDays).toBe(17);
  });
});

// ============================================================================
// 3. Inquiry Reminders
// ============================================================================

describe("Orchestration Config — Inquiry Reminders", () => {
  const { reminders, deadlineDays, onBreach } = orchestrationConfig.inquiry;

  it("has 4 inquiry reminders", () => {
    expect(reminders).toHaveLength(4);
  });

  it("all reminder dayOffsets are within [1, deadlineDays]", () => {
    for (const r of reminders) {
      expect(r.dayOffset).toBeGreaterThanOrEqual(1);
      expect(r.dayOffset).toBeLessThanOrEqual(deadlineDays);
    }
  });

  it("reminders are in chronological order", () => {
    for (let i = 1; i < reminders.length; i++) {
      expect(reminders[i].dayOffset).toBeGreaterThanOrEqual(reminders[i - 1].dayOffset);
    }
  });

  it("urgency escalates as deadline approaches", () => {
    // First two are normal, then high, then critical
    expect(reminders[0].urgency).toBe("normal");
    expect(reminders[1].urgency).toBe("normal");
    expect(reminders[2].urgency).toBe("high");
    expect(reminders[3].urgency).toBe("critical");
  });

  it("final reminder is at day 89 (one day before 90-day deadline)", () => {
    expect(reminders[reminders.length - 1].dayOffset).toBe(deadlineDays - 1);
  });

  it("all reminders reference existing notification definitions", () => {
    const definitionKeys = Object.keys(orchestrationConfig.notifications.definitions);
    for (const r of reminders) {
      expect(definitionKeys).toContain(r.notification);
    }
  });

  it("onBreach references existing notification definitions", () => {
    const definitionKeys = Object.keys(orchestrationConfig.notifications.definitions);
    for (const key of onBreach.notifications) {
      expect(definitionKeys).toContain(key);
    }
  });
});

// ============================================================================
// 4. Notification Definitions — structural integrity
// ============================================================================

describe("Orchestration Config — Notification Definitions", () => {
  const defs = orchestrationConfig.notifications.definitions;
  const defKeys = Object.keys(defs);

  it("has 13 notification definitions", () => {
    expect(defKeys).toHaveLength(13);
  });

  it("every definition has a description, recipients, and templates", () => {
    for (const key of defKeys) {
      const def = defs[key];
      expect(def.description).toBeTruthy();
      expect(def.recipients.length).toBeGreaterThanOrEqual(1);
      expect(Object.keys(def.templates).length).toBeGreaterThanOrEqual(1);
    }
  });

  it("every recipient audience has a matching template", () => {
    for (const key of defKeys) {
      const def = defs[key];
      for (const recipient of def.recipients) {
        expect(def.templates[recipient.audience]).toBeDefined();
      }
    }
  });

  it("email templates have subject and body", () => {
    for (const key of defKeys) {
      const def = defs[key];
      for (const recipient of def.recipients) {
        if (recipient.channel === "email") {
          const tmpl = def.templates[recipient.audience] as EmailTemplate;
          expect(tmpl.subject).toBeTruthy();
          expect(tmpl.body).toBeTruthy();
        }
      }
    }
  });

  it("bot templates have message", () => {
    for (const key of defKeys) {
      const def = defs[key];
      for (const recipient of def.recipients) {
        if (recipient.channel === "bot") {
          const tmpl = def.templates[recipient.audience] as BotTemplate;
          expect(tmpl.message).toBeTruthy();
        }
      }
    }
  });

  it("recipient channels are only email, bot, or teams_activity", () => {
    for (const key of defKeys) {
      for (const recipient of defs[key].recipients) {
        expect(["email", "bot", "teams_activity"]).toContain(recipient.channel);
      }
    }
  });

  it("all audience keys are from the known set", () => {
    const knownAudiences = new Set([
      "icc_presiding_officer",
      "icc_all_members",
      "complainant",
      "escalation_contacts_level_1",
      "escalation_contacts_level_2",
      "nodal_officer",
    ]);
    for (const key of defKeys) {
      for (const recipient of defs[key].recipients) {
        expect(knownAudiences.has(recipient.audience)).toBe(true);
      }
    }
  });

  // Specific notification existence checks
  const requiredNotifications = [
    "complaint_submitted",
    "complaint_acknowledged",
    "icc_reminder",
    "escalated_audit_committee",
    "complainant_escalated_audit",
    "escalated_district_officer",
    "complainant_escalated_district",
    "icc_inquiry_reminder",
    "icc_inquiry_urgent",
    "icc_inquiry_final",
    "complainant_inquiry_breached",
    "complaint_resolved",
    "criminal_threshold_alert",
  ];

  for (const name of requiredNotifications) {
    it(`has required notification: ${name}`, () => {
      expect(defs[name]).toBeDefined();
    });
  }
});

// ============================================================================
// 5. Template Rendering
// ============================================================================

describe("Template Rendering — renderTemplate()", () => {
  it("replaces single placeholder", () => {
    expect(renderTemplate("Hello {{name}}", { name: "Priya" })).toBe("Hello Priya");
  });

  it("replaces multiple placeholders", () => {
    const result = renderTemplate(
      "Complaint {{complaintNumber}} has {{daysRemaining}} days left",
      { complaintNumber: "RKS-001", daysRemaining: 15 },
    );
    expect(result).toBe("Complaint RKS-001 has 15 days left");
  });

  it("leaves unknown placeholders intact", () => {
    expect(renderTemplate("Hi {{name}}, id={{unknown}}", { name: "Test" })).toBe(
      "Hi Test, id={{unknown}}",
    );
  });

  it("handles numeric values", () => {
    expect(renderTemplate("Days: {{days}}", { days: 7 })).toBe("Days: 7");
  });

  it("handles empty string values", () => {
    expect(renderTemplate("Value: {{val}}", { val: "" })).toBe("Value: ");
  });

  it("returns template unchanged when no vars match", () => {
    const tmpl = "No {{placeholders}} here {{really}}";
    expect(renderTemplate(tmpl, {})).toBe(tmpl);
  });

  it("works with real complaint_submitted email template", () => {
    const def = getNotification("complaint_submitted");
    const tmpl = (def.templates["icc_presiding_officer"] as EmailTemplate).subject;
    const rendered = renderTemplate(tmpl, { complaintNumber: "RKS-20260415-0001" });
    expect(rendered).toBe("[Rakshak] New POSH Complaint: RKS-20260415-0001");
  });

  it("renders complaint_submitted body with all variables", () => {
    const def = getNotification("complaint_submitted");
    const tmpl = (def.templates["icc_presiding_officer"] as EmailTemplate).body;
    const rendered = renderTemplate(tmpl, {
      complaintNumber: "RKS-20260415-0001",
      category: "Sexual Harassment",
      severity: "high",
      criminalThreshold: "No",
      deadlineDays: 7,
    });
    expect(rendered).toContain("RKS-20260415-0001");
    expect(rendered).toContain("Sexual Harassment");
    expect(rendered).toContain("high");
    expect(rendered).toContain("7 days");
    expect(rendered).not.toContain("{{");
  });

  it("renders complainant bot message with all variables", () => {
    const def = getNotification("complaint_submitted");
    const tmpl = (def.templates["complainant"] as BotTemplate).message;
    const rendered = renderTemplate(tmpl, {
      complaintNumber: "RKS-001",
      deadlineDays: 7,
    });
    expect(rendered).toContain("RKS-001");
    expect(rendered).toContain("7 days");
    expect(rendered).not.toContain("{{");
  });

  it("renders escalation email with full context", () => {
    const def = getNotification("escalated_audit_committee");
    const tmpl = (def.templates["escalation_contacts_level_1"] as EmailTemplate).body;
    const rendered = renderTemplate(tmpl, {
      complaintNumber: "RKS-002",
      submittedDate: "2026-04-01",
      deadlineDays: 7,
      category: "Verbal Abuse",
      severity: "medium",
      daysSinceSubmission: 12,
    });
    expect(rendered).toContain("RKS-002");
    expect(rendered).toContain("POSH Act, 2013");
    expect(rendered).toContain("12");
    expect(rendered).not.toContain("{{");
  });
});

// ============================================================================
// 6. getNotification() helper
// ============================================================================

describe("getNotification()", () => {
  it("returns existing notification definition", () => {
    const def = getNotification("complaint_submitted");
    expect(def.description).toBeTruthy();
    expect(def.recipients.length).toBeGreaterThan(0);
  });

  it("throws for unknown notification key", () => {
    expect(() => getNotification("does_not_exist")).toThrow(
      'Unknown notification: "does_not_exist"',
    );
  });
});

// ============================================================================
// 7. Audience Resolution — iccConfig → concrete contacts
// ============================================================================

describe("Audience Resolution", () => {
  const complainant = {
    name: "Ananya Singh",
    email: "ananya@acme.com",
    userId: "user-ananya",
  };

  describe("icc_presiding_officer", () => {
    it("resolves to the active presiding officer", () => {
      const result = resolveAudience(
        "icc_presiding_officer",
        "email",
        sampleIccConfig,
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Priya Sharma");
      expect(result[0].email).toBe("priya@acme.com");
      expect(result[0].channel).toBe("email");
    });

    it("returns empty if presiding officer is inactive", () => {
      const config: IccConfiguration = {
        ...sampleIccConfig,
        iccMembers: sampleIccConfig.iccMembers.map((m) =>
          m.role === "presiding_officer" ? { ...m, isActive: false } : m,
        ),
      };
      expect(resolveAudience("icc_presiding_officer", "email", config)).toHaveLength(0);
    });
  });

  describe("icc_all_members", () => {
    it("resolves to all active members (excludes inactive)", () => {
      const result = resolveAudience("icc_all_members", "email", sampleIccConfig);
      // 4 total members, 1 inactive → 3
      expect(result).toHaveLength(3);
      const names = result.map((r) => r.name);
      expect(names).toContain("Priya Sharma");
      expect(names).toContain("Ravi Kumar");
      expect(names).toContain("Dr. Meera Nair");
      expect(names).not.toContain("Anil Deshmukh"); // inactive
    });
  });

  describe("escalation_contacts_level_1", () => {
    it("resolves to all level-1 contacts (Audit Committee)", () => {
      const result = resolveAudience(
        "escalation_contacts_level_1",
        "email",
        sampleIccConfig,
      );
      expect(result).toHaveLength(2);
      expect(result[0].email).toBe("audit-chair@acme.com");
      expect(result[1].email).toBe("audit-member@acme.com");
    });
  });

  describe("escalation_contacts_level_2", () => {
    it("resolves to level-2 contacts (District Officer)", () => {
      const result = resolveAudience(
        "escalation_contacts_level_2",
        "email",
        sampleIccConfig,
      );
      expect(result).toHaveLength(1);
      expect(result[0].email).toBe("do-pune@gov.in");
    });
  });

  describe("nodal_officer", () => {
    it("resolves from settings.nodalOfficerEmail", () => {
      const result = resolveAudience("nodal_officer", "email", sampleIccConfig);
      expect(result).toHaveLength(1);
      expect(result[0].email).toBe("nodal@acme.com");
    });

    it("returns empty when nodalOfficerEmail is empty", () => {
      const config: IccConfiguration = {
        ...sampleIccConfig,
        settings: { ...sampleIccConfig.settings, nodalOfficerEmail: "" },
      };
      expect(resolveAudience("nodal_officer", "email", config)).toHaveLength(0);
    });
  });

  describe("complainant", () => {
    it("resolves from complaint data (not iccConfig)", () => {
      const result = resolveAudience(
        "complainant",
        "bot",
        sampleIccConfig,
        complainant,
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Ananya Singh");
      expect(result[0].channel).toBe("bot");
      expect(result[0].userId).toBe("user-ananya");
    });

    it("returns empty when no complainant provided", () => {
      expect(resolveAudience("complainant", "bot", sampleIccConfig)).toHaveLength(0);
    });
  });

  describe("unknown audience", () => {
    it("returns empty for unknown audience key", () => {
      expect(resolveAudience("nonexistent", "email", sampleIccConfig)).toHaveLength(0);
    });
  });
});

// ============================================================================
// 8. Full Notification Resolution — config + iccConfig together
// ============================================================================

describe("Full Notification Resolution", () => {
  const complainant = {
    name: "Ananya Singh",
    email: "ananya@acme.com",
    userId: "user-ananya",
  };

  it("resolves complaint_submitted to ICC + complainant", () => {
    const def = getNotification("complaint_submitted");
    const resolved = resolveNotification(def, sampleIccConfig, complainant);
    // 1 presiding officer + 3 active ICC members + 1 complainant = 5
    expect(resolved).toHaveLength(5);

    const emails = resolved.filter((r) => r.channel === "email");
    const bots = resolved.filter((r) => r.channel === "bot");
    expect(emails).toHaveLength(4); // 1 PO + 3 active members
    expect(bots).toHaveLength(1);
    expect(bots[0].name).toBe("Ananya Singh");
  });

  it("resolves icc_reminder to only ICC (no complainant)", () => {
    const def = getNotification("icc_reminder");
    const resolved = resolveNotification(def, sampleIccConfig, complainant);
    // 1 presiding officer + 3 active members = 4
    expect(resolved).toHaveLength(4);
    expect(resolved.every((r) => r.channel === "email")).toBe(true);
  });

  it("resolves escalated_audit_committee", () => {
    const def = getNotification("escalated_audit_committee");
    const resolved = resolveNotification(def, sampleIccConfig);
    // 2 audit committee contacts + 1 presiding officer = 3
    expect(resolved).toHaveLength(3);
    const auditEmails = resolved.filter((r) =>
      r.email.includes("audit"),
    );
    expect(auditEmails).toHaveLength(2);
  });

  it("resolves escalated_district_officer to 3 recipients", () => {
    const def = getNotification("escalated_district_officer");
    const resolved = resolveNotification(def, sampleIccConfig);
    // 1 district officer + 1 nodal officer + 1 presiding officer = 3
    expect(resolved).toHaveLength(3);
    const recipientEmails = resolved.map((r) => r.email);
    expect(recipientEmails).toContain("do-pune@gov.in");
    expect(recipientEmails).toContain("nodal@acme.com");
    expect(recipientEmails).toContain("priya@acme.com");
  });

  it("resolves criminal_threshold_alert to PO + complainant", () => {
    const def = getNotification("criminal_threshold_alert");
    const resolved = resolveNotification(def, sampleIccConfig, complainant);
    expect(resolved).toHaveLength(2);
    expect(resolved.find((r) => r.channel === "email")?.email).toBe("priya@acme.com");
    expect(resolved.find((r) => r.channel === "bot")?.name).toBe("Ananya Singh");
  });
});

// ============================================================================
// 9. End-to-End Escalation Walkthrough
//    Simulates the full escalation chain: for each level, resolve audiences
//    and render templates with realistic data
// ============================================================================

describe("End-to-End Escalation Walkthrough", () => {
  const complainant = {
    name: "Ananya Singh",
    email: "ananya@acme.com",
    userId: "user-ananya",
  };

  const vars = {
    complaintNumber: "RKS-20260415-0001",
    category: "Sexual Harassment",
    severity: "high",
    criminalThreshold: "No",
    deadlineDays: orchestrationConfig.acknowledgement.deadlineDays,
    deadlineDate: "2026-04-22",
    submittedDate: "2026-04-15",
    daysSinceSubmission: 10,
    escalationWaitDays: 3,
    auditEscalationDate: "2026-04-25",
    inquiryDeadlineDays: orchestrationConfig.inquiry.deadlineDays,
  };

  it("walks through all 3 escalation levels without errors", () => {
    for (const level of orchestrationConfig.escalation.levels) {
      for (const notifKey of level.notifications) {
        const def = getNotification(notifKey);
        const resolved = resolveNotification(def, sampleIccConfig, complainant);

        // Every notification must resolve to at least 1 real recipient
        expect(resolved.length).toBeGreaterThan(0);

        // Render all templates
        for (const [audience, template] of Object.entries(def.templates)) {
          if ("subject" in template) {
            const subject = renderTemplate(template.subject, vars);
            const body = renderTemplate(template.body, vars);
            expect(subject).toBeTruthy();
            expect(body).toBeTruthy();
            expect(subject).toContain("RKS-20260415-0001");
          } else if ("message" in template) {
            const message = renderTemplate(template.message, vars);
            expect(message).toBeTruthy();
            expect(message).toContain("RKS-20260415-0001");
          }
        }
      }
    }
  });
});

// ============================================================================
// 10. Inquiry Reminder Walkthrough
// ============================================================================

describe("End-to-End Inquiry Reminders Walkthrough", () => {
  const vars = {
    complaintNumber: "RKS-20260415-0001",
    daysRemaining: 0,
    inquiryDeadlineDate: "2026-07-14",
  };

  it("renders all inquiry reminders with correct days remaining", () => {
    for (const reminder of orchestrationConfig.inquiry.reminders) {
      const daysRemaining = orchestrationConfig.inquiry.deadlineDays - reminder.dayOffset;
      const localVars = { ...vars, daysRemaining };

      const def = getNotification(reminder.notification);
      const resolved = resolveNotification(def, sampleIccConfig);
      expect(resolved.length).toBeGreaterThan(0);

      for (const [, template] of Object.entries(def.templates)) {
        if ("subject" in template) {
          const subject = renderTemplate(template.subject, localVars);
          expect(subject).toContain(String(daysRemaining));
        }
      }
    }
  });

  it("breach notifications resolve and render", () => {
    const complainant = {
      name: "Ananya Singh",
      email: "ananya@acme.com",
      userId: "user-ananya",
    };

    for (const notifKey of orchestrationConfig.inquiry.onBreach.notifications) {
      const def = getNotification(notifKey);
      const resolved = resolveNotification(def, sampleIccConfig, complainant);
      expect(resolved.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// 11. ICC Settings → Orchestration Config Alignment
// ============================================================================

describe("IccSettings ↔ Orchestration Config Alignment", () => {
  it("iccConfig acknowledgementDeadlineDays matches orchestration default", () => {
    expect(sampleIccConfig.settings.acknowledgementDeadlineDays).toBe(
      orchestrationConfig.acknowledgement.deadlineDays,
    );
  });

  it("iccConfig inquiryDeadlineDays matches orchestration default", () => {
    expect(sampleIccConfig.settings.inquiryDeadlineDays).toBe(
      orchestrationConfig.inquiry.deadlineDays,
    );
  });

  it("autoEscalateOnMiss aligns with escalation.enabled", () => {
    expect(sampleIccConfig.settings.autoEscalateOnMiss).toBe(
      orchestrationConfig.escalation.enabled,
    );
  });

  it("enableCriminalThresholdAlert has matching criminal_threshold_alert notification", () => {
    expect(sampleIccConfig.settings.enableCriminalThresholdAlert).toBe(true);
    expect(
      orchestrationConfig.notifications.definitions["criminal_threshold_alert"],
    ).toBeDefined();
  });
});

// ============================================================================
// 12. Validation Edge Cases — ensure bad configs are caught
// ============================================================================

describe("Orchestration Config — Validation Edge Cases", () => {
  // We can't re-run validate() directly since it's not exported,
  // but we can verify the config as loaded has sane boundaries

  it("no escalation level has negative waitDays", () => {
    for (const level of orchestrationConfig.escalation.levels) {
      expect(level.waitDaysAfterPrevious).toBeGreaterThanOrEqual(0);
    }
  });

  it("no inquiry reminder is outside [1, deadlineDays] range", () => {
    for (const r of orchestrationConfig.inquiry.reminders) {
      expect(r.dayOffset).toBeGreaterThanOrEqual(1);
      expect(r.dayOffset).toBeLessThanOrEqual(orchestrationConfig.inquiry.deadlineDays);
    }
  });

  it("no notification definition has empty recipients", () => {
    for (const [key, def] of Object.entries(
      orchestrationConfig.notifications.definitions,
    )) {
      expect(def.recipients.length).toBeGreaterThan(0);
    }
  });

  it("no template has empty subject/body/message", () => {
    for (const [, def] of Object.entries(
      orchestrationConfig.notifications.definitions,
    )) {
      for (const [, tmpl] of Object.entries(def.templates)) {
        if ("subject" in tmpl) {
          expect(tmpl.subject.length).toBeGreaterThan(0);
          expect(tmpl.body.length).toBeGreaterThan(0);
        }
        if ("message" in tmpl) {
          expect(tmpl.message.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("every template audience in recipients list has a corresponding template", () => {
    for (const [, def] of Object.entries(
      orchestrationConfig.notifications.definitions,
    )) {
      const templateKeys = new Set(Object.keys(def.templates));
      const audienceKeys = new Set(def.recipients.map((r) => r.audience));
      // Every audience referenced in recipients must have a template
      for (const aud of audienceKeys) {
        expect(templateKeys.has(aud)).toBe(true);
      }
    }
  });
});
