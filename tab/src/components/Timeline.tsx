/**
 * Raksha Tab — Timeline Component
 *
 * Vertical timeline showing the audit trail of a complaint.
 * Each entry shows the action, who did it, and when.
 */

import {
  CheckmarkCircle24Filled,
  Warning24Filled,
  ArrowForward24Filled,
  Clock24Regular,
  Document24Regular,
  Mail24Regular,
  PersonFeedback24Regular,
} from "@fluentui/react-icons";
import type { AuditEntry } from "../services/apiClient";

const ACTION_LABELS: Record<string, string> = {
  created: "Complaint draft created",
  submitted: "Complaint submitted",
  acknowledged: "Acknowledged by ICC",
  status_changed: "ICC action recorded",
  under_inquiry: "Inquiry started",
  escalated: "Complaint escalated",
  resolved: "Complaint resolved",
  pdf_generated: "Complaint PDF generated",
  notification_sent: "Notification sent",
  reminder_sent_icc: "Reminder sent to ICC",
  inquiry_reminder_sent: "Inquiry deadline reminder sent",
  escalation_check_passed: "Escalation check — no action needed",
  escalated_audit_committee: "Escalated to Audit Committee",
  escalated_district_officer: "Escalated to District Officer",
  inquiry_deadline_breached: "90-day inquiry deadline breached",
  appealed: "Complainant appealed to higher authority",
  appeal_reviewed: "Appeal reviewed",
};

function getIcon(action: string) {
  const base = "w-5 h-5 shrink-0";
  switch (action) {
    case "resolved":
      return <CheckmarkCircle24Filled className={`${base} text-emerald-500`} />;
    case "escalated":
    case "escalated_audit_committee":
    case "escalated_district_officer":
    case "inquiry_deadline_breached":
    case "appealed":
      return <Warning24Filled className={`${base} text-red-500`} />;
    case "submitted":
    case "acknowledged":
      return <ArrowForward24Filled className={`${base} text-blue-500`} />;
    case "pdf_generated":
      return <Document24Regular className={`${base} text-gray-400`} />;
    case "notification_sent":
    case "reminder_sent_icc":
    case "inquiry_reminder_sent":
      return <Mail24Regular className={`${base} text-sky-500`} />;
    case "status_changed":
      return <PersonFeedback24Regular className={`${base} text-amber-500`} />;
    default:
      return <Clock24Regular className={`${base} text-gray-400`} />;
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface TimelineProps {
  entries: AuditEntry[];
}

export function Timeline({ entries }: TimelineProps) {
  if (entries.length === 0) {
    return <p className="text-sm text-gray-400 italic">No timeline entries yet.</p>;
  }

  return (
    <div className="flex flex-col pl-2">
      {entries.map((entry, i) => (
        <div key={entry.id} className="flex gap-3 items-start relative pb-5 pl-1">
          {/* Connecting line */}
          {i < entries.length - 1 && (
            <div className="absolute left-[13px] top-8 bottom-0 w-px bg-gray-200" />
          )}
          <div className="z-10 bg-white">{getIcon(entry.action)}</div>
          <div className="flex flex-col gap-0.5 pt-0.5">
            <p className="text-sm font-medium text-gray-900">
              {ACTION_LABELS[entry.action] ?? entry.action}
            </p>
            <p className="text-[13px] text-gray-500">
              {formatTime(entry.timestamp)}
              {entry.performedByRole !== "system" && ` · by ${entry.performedByRole}`}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
