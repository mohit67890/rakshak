/**
 * Raksha Tab — ICC Case View
 *
 * Full complaint detail for ICC members with action buttons
 * to acknowledge or resolve the complaint.
 */

import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft24Regular,
  Checkmark24Regular,
  CheckmarkCircle24Regular,
  Dismiss24Regular,
} from "@fluentui/react-icons";
import { useCurrentUser } from "../context/AuthContext";
import {
  getComplaintById,
  acknowledgeComplaint,
  resolveComplaint,
  type Complaint,
  type AuditEntry,
} from "../services/apiClient";
import { Section, Field, formatDate } from "../components/shared";
import { StatusBadge } from "../components/StatusBadge";
import { Timeline } from "../components/Timeline";
import { Loading } from "../components/Loading";
import { ErrorBanner } from "../components/ErrorBanner";
import { Comments } from "../components/Comments";

export function IccCaseView() {
  const { complaintId } = useParams<{ complaintId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useCurrentUser();
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [timeline, setTimeline] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [resolution, setResolution] = useState("");
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user || !complaintId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getComplaintById(complaintId, user.tenantId, user.userId, "icc");
      setComplaint(data.complaint);
      setTimeline(data.timeline);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [user, complaintId]);

  useEffect(() => {
    if (!authLoading && user) fetchData();
  }, [authLoading, user, fetchData]);

  const handleAcknowledge = async () => {
    if (!user || !complaintId) return;
    setActionLoading(true);
    setError(null);
    try {
      await acknowledgeComplaint(complaintId, user.tenantId);
      setActionSuccess("Complaint acknowledged successfully. The inquiry period has begun.");
      await fetchData();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolve = async () => {
    if (!user || !complaintId || !resolution.trim()) return;
    setActionLoading(true);
    setError(null);
    try {
      await resolveComplaint(complaintId, user.tenantId, resolution.trim());
      setActionSuccess("Complaint resolved. The complainant has been notified.");
      setResolveDialogOpen(false);
      setResolution("");
      await fetchData();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  if (authLoading || loading) return <Loading />;
  if (error && !complaint) return <div className="p-6"><ErrorBanner message={error} /></div>;
  if (!complaint) return <div className="p-6"><ErrorBanner message="Complaint not found" /></div>;

  const canAcknowledge = complaint.status === "submitted";
  const canResolve = complaint.status === "under_inquiry" || complaint.status === "acknowledged";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-5xl mx-auto px-5 py-8"
    >
      <button
        onClick={() => navigate("/icc")}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors mb-5"
      >
        <ArrowLeft24Regular className="w-4 h-4" />
        Back to Dashboard
      </button>

      {error && <ErrorBanner message={error} />}

      {actionSuccess && (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
          <p className="text-sm text-emerald-700">{actionSuccess}</p>
        </div>
      )}

      {/* Header + Actions */}
      <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{complaint.complaintNumber}</h1>
          <p className="text-[13px] text-gray-500 mt-1">
            Filed {formatDate(complaint.submittedAt || complaint.createdAt)}
            {complaint.complainantName && ` by ${complaint.complainantName}`}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <StatusBadge status={complaint.status} />
          {canAcknowledge && (
            <button
              onClick={handleAcknowledge}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              <Checkmark24Regular className="w-4 h-4" />
              Acknowledge
            </button>
          )}
          {canResolve && (
            <button
              onClick={() => setResolveDialogOpen(true)}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              <CheckmarkCircle24Regular className="w-4 h-4" />
              Resolve
            </button>
          )}
        </div>
      </div>

      {/* Criminal Threshold Warning */}
      {complaint.isCriminalThreshold && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">
            <strong>Criminal Threshold Detected</strong> — This complaint may involve
            conduct under BNS Sections {complaint.bnsSections.join(", ")}. Consider involving law
            enforcement per POSH Act Section 19.
          </p>
        </div>
      )}

      {/* Incident Details */}
      <Section title="Incident Details">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date" value={formatDate(complaint.incidentDate)} />
          <Field label="Location" value={complaint.incidentLocation || "Not specified"} />
          <Field label="Category" value={complaint.category.replace(/_/g, " ")} />
          <Field label="Severity" value={complaint.severity} />
        </div>
      </Section>

      {/* Account */}
      <Section title="Complainant's Account">
        <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
          {complaint.description || "No description provided."}
        </p>
      </Section>

      {/* Accused Persons */}
      {complaint.accusedPersons.length > 0 && (
        <Section title="Accused Person(s)">
          <div className="flex gap-3 flex-wrap">
            {complaint.accusedPersons.map((p, i) => (
              <div key={i} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-sm font-medium text-gray-900">{p.name}</p>
                <p className="text-[13px] text-gray-500">{p.designation} · {p.department}</p>
                <p className="text-[13px] text-gray-500 capitalize">Relationship: {p.relationship}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Witnesses */}
      {complaint.witnesses.length > 0 && (
        <Section title="Witnesses">
          <div className="flex gap-3 flex-wrap">
            {complaint.witnesses.map((w, i) => (
              <div key={i} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-sm font-medium text-gray-900">{w.name}</p>
                <p className="text-[13px] text-gray-500">{w.designation}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Legal Classification */}
      {(complaint.poshSections.length > 0 || complaint.bnsSections.length > 0) && (
        <Section title="Legal Classification">
          <div className="flex gap-2 flex-wrap">
            {complaint.poshSections.map((s) => (
              <span key={s} className="text-xs font-medium px-2 py-0.5 rounded-md bg-violet-50 text-violet-700">
                POSH {s}
              </span>
            ))}
            {complaint.bnsSections.map((s) => (
              <span key={s} className="text-xs font-medium px-2 py-0.5 rounded-md bg-red-50 text-red-700">
                BNS {s}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Deadlines */}
      <Section title="Deadlines">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Acknowledgement deadline" value={formatDate(complaint.acknowledgeDeadline)} />
          <Field label="Acknowledged at" value={formatDate(complaint.acknowledgedAt)} />
          <Field label="Inquiry deadline (90 days)" value={formatDate(complaint.inquiryDeadline)} />
          <Field label="Resolved at" value={formatDate(complaint.resolvedAt)} />
        </div>
      </Section>

      {/* Resolution */}
      {complaint.resolution && (
        <Section title="Resolution">
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {complaint.resolution}
          </p>
        </Section>
      )}

      {/* Comments */}
      {user && (
        <Section title="Comments">
          <Comments
            complaintId={complaint.id}
            tenantId={user.tenantId}
            userId={user.userId}
            userName={user.displayName}
            role="icc"
            allowNew={complaint.status !== "closed"}
          />
        </Section>
      )}

      <hr className="my-6 border-gray-200" />

      {/* Timeline */}
      <Section title="Timeline">
        <Timeline entries={timeline} />
      </Section>

      {/* Resolve Dialog (modal) */}
      <AnimatePresence>
        {resolveDialogOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
            onClick={() => setResolveDialogOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">Resolve Complaint</h2>
                <button
                  onClick={() => setResolveDialogOpen(false)}
                  className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <Dismiss24Regular className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              <p className="text-sm text-gray-500 mb-4">
                Provide the resolution details. This will be shared with the complainant.
              </p>
              <textarea
                placeholder="Describe the action taken, findings, and resolution..."
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                rows={6}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 resize-none"
              />
              <div className="flex justify-end gap-3 mt-4">
                <button
                  onClick={() => setResolveDialogOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleResolve}
                  disabled={!resolution.trim() || actionLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  Submit Resolution
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
