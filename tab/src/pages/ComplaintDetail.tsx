/**
 * Raksha Tab — Complaint Detail Page
 *
 * Full view of a single complaint with audit timeline.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft24Regular } from "@fluentui/react-icons";
import { useCurrentUser } from "../context/AuthContext";
import {
  getComplaintById,
  uploadEvidence,
  type Complaint,
  type AuditEntry,
} from "../services/apiClient";
import { Section, Field, formatDate } from "../components/shared";
import { StatusBadge } from "../components/StatusBadge";
import { Timeline } from "../components/Timeline";
import { Loading } from "../components/Loading";
import { ErrorBanner } from "../components/ErrorBanner";
import { Comments } from "../components/Comments";
import { AppealPanel } from "../components/AppealPanel";

export function ComplaintDetail() {
  const { complaintId } = useParams<{ complaintId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useCurrentUser();
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [timeline, setTimeline] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Evidence upload state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    if (!user || !complaintId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getComplaintById(complaintId, user.tenantId, user.userId, user.role);
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

  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files?.length || !user || !complaint) return;
    setUploadError(null);
    setUploading(true);

    try {
      for (const file of Array.from(files)) {
        const result = await uploadEvidence(complaint.id, user.tenantId, user.userId, file);
        // Add the SAS URL to the local state so it appears immediately
        setComplaint(prev => prev ? {
          ...prev,
          evidenceUrls: [...prev.evidenceUrls, result.blobUrl],
        } : prev);
      }
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [user, complaint]);

  if (authLoading || loading) return <Loading />;
  if (error) return <div className="p-6"><ErrorBanner message={error} /></div>;
  if (!complaint) return <div className="p-6"><ErrorBanner message="Complaint not found" /></div>;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-5xl mx-auto px-5 py-8"
    >
      <button
        onClick={() => navigate("/cases")}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors mb-5"
      >
        <ArrowLeft24Regular className="w-4 h-4" />
        Back to My Cases
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-8">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{complaint.complaintNumber}</h1>
          <p className="text-[13px] text-gray-500 mt-1">
            Filed {formatDate(complaint.submittedAt || complaint.createdAt)}
          </p>
        </div>
        <StatusBadge status={complaint.status} />
      </div>

      {/* Key Facts */}
      <Section title="Incident Details">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date" value={formatDate(complaint.incidentDate)} />
          <Field label="Location" value={complaint.incidentLocation || "Not specified"} />
          <Field label="Category" value={complaint.category.replace(/_/g, " ")} />
          <Field label="Severity" value={complaint.severity} />
        </div>
      </Section>

      {/* Description */}
      <Section title="Account">
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
          {complaint.isCriminalThreshold && (
            <p className="text-xs text-red-600 mt-2">
              This complaint may involve criminal conduct under the Bharatiya Nyaya Sanhita.
            </p>
          )}
        </Section>
      )}

      {/* Evidence */}
      <Section title="Evidence">
        {complaint.evidenceUrls.length > 0 && (
          <div className="space-y-2 mb-4">
            {complaint.evidenceUrls.map((url, i) => {
              const fileName = decodeURIComponent(url.split("/").pop()?.split("?")[0]?.replace(/^[a-f0-9-]+-/, "") || `File ${i + 1}`);
              const isImage = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(fileName);
              return (
                <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <span className="text-lg">{isImage ? "🖼️" : "📎"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{fileName}</p>
                  </div>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-violet-600 hover:text-violet-800 shrink-0"
                  >
                    View
                  </a>
                </div>
              );
            })}
            <p className="text-xs text-gray-400">{complaint.evidenceUrls.length} file{complaint.evidenceUrls.length === 1 ? "" : "s"} attached</p>
          </div>
        )}

        {/* Upload area — only for complaints that aren't closed/resolved */}
        {complaint.status !== "closed" && complaint.status !== "resolved" && (
          <div
            className={`relative rounded-lg border-2 border-dashed transition-colors p-5 text-center ${
              dragOver
                ? "border-violet-400 bg-violet-50"
                : "border-gray-300 bg-gray-50 hover:border-gray-400"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFileUpload(e.dataTransfer.files);
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.eml,.msg,.txt"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              onChange={(e) => handleFileUpload(e.target.files)}
              disabled={uploading}
            />
            {uploading ? (
              <div className="flex items-center justify-center gap-2 py-1">
                <svg className="animate-spin h-4 w-4 text-violet-600" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm text-violet-600 font-medium">Uploading...</span>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-600">
                  {dragOver ? "Drop files here" : "Drag files here or click to upload"}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Images, PDFs, Word, Excel, emails — up to 25 MB each
                </p>
              </>
            )}
          </div>
        )}

        {uploadError && (
          <p className="text-xs text-red-600 mt-2">{uploadError}</p>
        )}

        {complaint.evidenceUrls.length === 0 && complaint.status === "closed" && (
          <p className="text-sm text-gray-500">No evidence attached.</p>
        )}
      </Section>

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

      {/* Appeal — only visible to the complainant themselves, after submission */}
      {user &&
        user.role === "employee" &&
        complaint.complainantId === user.userId &&
        complaint.status !== "draft" && (
          <Section title="Appeal">
            <AppealPanel
              complaint={complaint}
              userId={user.userId}
              onAppealed={(updates) =>
                setComplaint((prev) => (prev ? { ...prev, ...updates } : prev))
              }
            />
          </Section>
        )}

      {/* Comments */}
      {complaint.status !== "draft" && user && (
        <Section title="Comments">
          <Comments
            complaintId={complaint.id}
            tenantId={user.tenantId}
            userId={user.userId}
            userName={user.displayName}
            role={user.role}
            allowNew={complaint.status !== "closed"}
          />
        </Section>
      )}

      <hr className="my-6 border-gray-200" />

      {/* Timeline */}
      <Section title="Timeline">
        <Timeline entries={timeline} />
      </Section>
    </motion.div>
  );
}
