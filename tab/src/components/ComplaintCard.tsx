/**
 * Rakshak Tab — Complaint Card Component
 *
 * Summary card for a complaint in a list view.
 */

import { StatusBadge } from "./StatusBadge";
import type { Complaint } from "../services/apiClient";

interface ComplaintCardProps {
  complaint: Complaint;
  onClick: () => void;
  showComplainant?: boolean;
}

export function ComplaintCard({ complaint, onClick, showComplainant }: ComplaintCardProps) {
  const dateLabel = complaint.incidentDate
    ? new Date(complaint.incidentDate).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Date not specified";

  const isSevere = complaint.severity === "high" || complaint.severity === "criminal";

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-4 bg-white rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50/50 transition-colors group"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <span className="text-sm font-semibold text-gray-900">
            {complaint.complaintNumber}
          </span>
          <span className="text-[13px] text-gray-500 ml-2 capitalize">
            {complaint.category.replace(/_/g, " ")}
          </span>
        </div>
        <StatusBadge status={complaint.status} />
      </div>

      <div className="flex items-center gap-3 flex-wrap text-[13px] text-gray-500">
        <span>Incident: {dateLabel}</span>
        <span className={isSevere ? "text-red-600 font-medium" : ""}>
          Severity: {complaint.severity}
        </span>
        {complaint.isCriminalThreshold && (
          <span className="text-red-600 font-semibold bg-red-50 px-2 py-0.5 rounded-md">
            Criminal threshold
          </span>
        )}
        {showComplainant && complaint.complainantName && (
          <span>By: {complaint.complainantName}</span>
        )}
      </div>

      {complaint.description && (
        <p className="text-[13px] text-gray-500 mt-2 line-clamp-2 leading-relaxed">
          {complaint.description.slice(0, 150)}
          {complaint.description.length > 150 ? "..." : ""}
        </p>
      )}
    </button>
  );
}
