/**
 * Rakshak Tab — Status Badge Component
 *
 * Color-coded pill showing complaint status.
 * Colors are semantic: amber=pending, blue=in-progress, green=resolved, red=escalated.
 */

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: "bg-gray-100", text: "text-gray-600", label: "Draft" },
  submitted: { bg: "bg-amber-50", text: "text-amber-700", label: "Submitted" },
  acknowledged: { bg: "bg-blue-50", text: "text-blue-700", label: "Acknowledged" },
  under_inquiry: { bg: "bg-sky-50", text: "text-sky-700", label: "Under Inquiry" },
  resolved: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Resolved" },
  escalated: { bg: "bg-red-50", text: "text-red-700", label: "Escalated" },
  closed: { bg: "bg-gray-100", text: "text-gray-600", label: "Closed" },
};

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? { bg: "bg-gray-100", text: "text-gray-600", label: status };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}
