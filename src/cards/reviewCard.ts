/**
 * Raksha — Review Summary Card
 *
 * Shown when the user (or LLM) decides it's time to review the complaint
 * before submission. Displays all collected information in a clean,
 * structured format with Submit and Continue Editing actions.
 *
 * Once submitted, the complaint cannot be edited — only comments can be
 * added later. This card makes that clear.
 */

import {
  AdaptiveCard,
  TextBlock,
  ActionSet,
  ExecuteAction,
  FactSet,
  Fact,
  Container,
} from "@microsoft/teams.cards";
import type { CardElementArray } from "@microsoft/teams.cards";
import type { Complaint, AccusedPerson, Witness } from "../models/complaint";

// ============================================================================
// Category / Severity labels
// ============================================================================

const CATEGORY_LABELS: Record<string, string> = {
  sexual_harassment: "Sexual Harassment",
  verbal_abuse: "Verbal Abuse",
  physical_contact: "Unwelcome Physical Contact",
  quid_pro_quo: "Quid Pro Quo",
  hostile_environment: "Hostile Work Environment",
  religious_harassment: "Religious Harassment",
  other: "Other",
};

const SEVERITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  criminal: "Criminal Threshold",
};

// ============================================================================
// Build Review Summary Card
// ============================================================================

export function buildReviewSummaryCard(complaint: Complaint): AdaptiveCard {
  const facts: Fact[] = [];

  // Date
  if (complaint.incidentDate) {
    facts.push(new Fact("When", complaint.incidentDate));
  }

  // Location
  if (complaint.incidentLocation) {
    facts.push(new Fact("Where", complaint.incidentLocation));
  }

  // Category
  facts.push(
    new Fact("Category", CATEGORY_LABELS[complaint.category] ?? complaint.category),
  );

  // Severity
  facts.push(
    new Fact("Severity", SEVERITY_LABELS[complaint.severity] ?? complaint.severity),
  );

  // Accused person(s)
  if (complaint.accusedPersons.length > 0) {
    facts.push(
      new Fact("Accused", formatAccusedPersons(complaint.accusedPersons)),
    );
  }

  // Witnesses
  if (complaint.witnesses.length > 0) {
    facts.push(
      new Fact("Witnesses", formatWitnesses(complaint.witnesses)),
    );
  } else {
    facts.push(new Fact("Witnesses", "None identified"));
  }

  // Evidence count
  if (complaint.evidenceUrls.length > 0) {
    const count = complaint.evidenceUrls.length;
    facts.push(
      new Fact("Evidence", `${count} file${count === 1 ? "" : "s"} attached`),
    );
  }

  // Legal sections (only if classified)
  if (complaint.poshSections.length > 0) {
    facts.push(
      new Fact("POSH Act Sections", complaint.poshSections.join(", ")),
    );
  }

  if (complaint.isCriminalThreshold && complaint.bnsSections.length > 0) {
    facts.push(
      new Fact("BNS Sections (Criminal)", complaint.bnsSections.join(", ")),
    );
  }

  // Build the card
  const elements: CardElementArray = [
    new TextBlock("Complaint Summary", {
      size: "Large",
      weight: "Bolder",
      wrap: true,
    }),

    new TextBlock(
      `Complaint **${complaint.complaintNumber}** — please review carefully before submitting.`,
      { wrap: true, spacing: "Small", size: "Small" },
    ),
  ];

  // Description in its own container for visual separation
  if (complaint.description) {
    elements.push(
      new TextBlock("Your Account", {
        weight: "Bolder",
        spacing: "Large",
        wrap: true,
      }),
      new TextBlock(complaint.description, {
        wrap: true,
        spacing: "Small",
        size: "Small",
      }),
    );
  }

  // Facts section
  elements.push(
    new TextBlock("Details", {
      weight: "Bolder",
      spacing: "Large",
      wrap: true,
    }),
    new FactSet(...facts),
  );

  // Criminal threshold warning
  if (complaint.isCriminalThreshold) {
    elements.push(
      new Container(
        new TextBlock(
          "⚠ **Criminal Threshold Detected** — This complaint involves conduct that may " +
          "constitute a criminal offence under the Bharatiya Nyaya Sanhita. The ICC will " +
          "be advised to assist with filing a criminal complaint if you choose to proceed.",
          { wrap: true, size: "Small", color: "Attention" },
        ),
      ),
    );
  }

  // Submission warning
  elements.push(
    new TextBlock(
      "Once submitted, this complaint **cannot be edited** — but you can add comments " +
      "and additional evidence later. The ICC will be notified immediately.",
      { wrap: true, spacing: "Large", size: "Small", isSubtle: true },
    ),
  );

  // Actions
  elements.push(
    new ActionSet(
      new ExecuteAction({ title: "Submit Complaint" })
        .withVerb("submit_complaint")
        .withData({ action: "submit_complaint", complaintId: complaint.id })
        .withStyle("positive"),

      new ExecuteAction({ title: "I want to make changes" })
        .withVerb("continue_editing")
        .withData({ action: "continue_intake" }),
    ),
  );

  return new AdaptiveCard(...elements);
}

// ============================================================================
// Post-submission confirmation card
// ============================================================================

export function buildSubmissionConfirmationCard(complaint: Complaint): AdaptiveCard {
  return new AdaptiveCard(
    new TextBlock("Complaint Submitted", {
      size: "Large",
      weight: "Bolder",
      wrap: true,
      color: "Good",
    }),

    new TextBlock(
      `Your complaint **${complaint.complaintNumber}** has been submitted successfully.`,
      { wrap: true, spacing: "Small" },
    ),

    new FactSet(
      new Fact("Complaint ID", complaint.complaintNumber),
      new Fact("Submitted At", formatDateTime(complaint.submittedAt)),
      new Fact("ICC Deadline", formatDateTime(complaint.acknowledgeDeadline)),
    ),

    new TextBlock(
      "The Internal Complaints Committee has been notified and must acknowledge " +
      "your complaint within the deadline shown above. You can check the status " +
      "anytime by messaging me or saying **\"status\"**.",
      { wrap: true, spacing: "Medium", size: "Small" },
    ),

    new TextBlock(
      "If the ICC doesn't respond in time, your complaint will be **automatically " +
      "escalated** — first to the Audit Committee, then to the District Officer. " +
      "You don't need to do anything.",
      { wrap: true, spacing: "Small", size: "Small", isSubtle: true },
    ),
  );
}

// ============================================================================
// Helpers
// ============================================================================

function formatAccusedPersons(persons: AccusedPerson[]): string {
  return persons
    .map((p) => {
      const parts = [p.name];
      if (p.designation) parts.push(p.designation);
      if (p.department) parts.push(p.department);
      return parts.join(" — ");
    })
    .join("; ");
}

function formatWitnesses(witnesses: Witness[]): string {
  return witnesses
    .map((w) => (w.designation ? `${w.name} (${w.designation})` : w.name))
    .join("; ");
}

function formatDateTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
