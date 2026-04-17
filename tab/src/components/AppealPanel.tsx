/**
 * Raksha Tab — Appeal Panel
 *
 * Surfaced on the complainant's Complaint Detail page when the complaint
 * is in a state that allows appeal (resolved, acknowledgement missed,
 * or 90-day inquiry breached).
 *
 * Two states:
 *   1. No active appeal → show the "Appeal to higher authority" form.
 *   2. Appeal already filed → show appeal status summary.
 */

import { useMemo, useState } from "react";
import {
  ShieldTask24Regular,
  Warning24Filled,
  CheckmarkCircle24Filled,
  BuildingGovernment24Regular,
  Gavel24Regular,
} from "@fluentui/react-icons";
import { appealComplaint, type Complaint } from "../services/apiClient";
import { formatDate } from "./shared";

interface AppealPanelProps {
  complaint: Complaint;
  userId: string;
  onAppealed: (updated: Partial<Complaint>) => void;
}

function eligibility(c: Complaint): { eligible: boolean; hint: string } {
  const now = Date.now();
  const ackMissed =
    !c.acknowledgedAt &&
    !!c.acknowledgeDeadline &&
    new Date(c.acknowledgeDeadline).getTime() < now;
  const inquiryBreached =
    !c.resolvedAt &&
    !!c.inquiryDeadline &&
    new Date(c.inquiryDeadline).getTime() < now;
  const resolved = c.status === "resolved";

  if (resolved) return { eligible: true, hint: "You may appeal if you are not satisfied with the ICC's resolution." };
  if (inquiryBreached) return { eligible: true, hint: "The 90-day inquiry deadline has passed without resolution." };
  if (ackMissed) return { eligible: true, hint: "The ICC has missed the acknowledgement deadline." };
  return {
    eligible: false,
    hint: "You can appeal once the complaint is resolved, the ICC misses a deadline, or the 90-day inquiry period lapses.",
  };
}

export function AppealPanel({ complaint, userId, onAppealed }: AppealPanelProps) {
  const hasActiveAppeal =
    complaint.appealStatus === "pending" || complaint.appealStatus === "under_review";
  const hasConcludedAppeal =
    complaint.appealStatus === "upheld" || complaint.appealStatus === "rejected";

  const currentLevel = complaint.appealedToLevel ?? 0;
  const { eligible, hint } = useMemo(() => eligibility(complaint), [complaint]);
  const canStillAppeal = currentLevel < 2;

  const [showForm, setShowForm] = useState(false);
  const [targetLevel, setTargetLevel] = useState<1 | 2>(
    (Math.max(1, currentLevel + 1) as 1 | 2) > 2 ? 2 : (Math.max(1, currentLevel + 1) as 1 | 2),
  );
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (reason.trim().length < 20) {
      setError("Please describe your reason in at least 20 characters.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await appealComplaint(
        complaint.id,
        complaint.tenantId,
        userId,
        targetLevel,
        reason.trim(),
      );
      onAppealed({
        status: "escalated",
        escalationLevel: targetLevel,
        appealStatus: result.appealStatus,
        appealedAt: result.appealedAt,
        appealedToLevel: result.appealedToLevel,
        appealReason: reason.trim(),
      });
      setShowForm(false);
      setReason("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- Rendered states ----------

  // "Eligibility" for the form: either a normal trigger (resolved / deadline
  // miss / inquiry breach) OR a previously-rejected appeal that can still
  // escalate further. Pending appeals block the form entirely.
  const formEligible = (eligible || complaint.appealStatus === "rejected") && !hasActiveAppeal && canStillAppeal;

  // Previous appeal status card — shown whenever there's been any appeal.
  const previousAppealCard =
    hasActiveAppeal ? (
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-5">
        <div className="flex items-start gap-3">
          <ShieldTask24Regular className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-amber-900">
              Appeal filed — {complaint.appealedToLevel === 1 ? "Audit Committee" : "District Officer"}
            </h3>
            <p className="text-[13px] text-amber-800 mt-1">
              Filed on {formatDate(complaint.appealedAt)}. Status: <strong>{complaint.appealStatus}</strong>.
            </p>
            {complaint.appealReason && (
              <blockquote className="mt-3 text-[13px] text-amber-900/90 italic border-l-2 border-amber-300 pl-3 whitespace-pre-wrap">
                "{complaint.appealReason}"
              </blockquote>
            )}
            {canStillAppeal && complaint.appealedToLevel === 1 && (
              <p className="text-[12px] text-amber-700 mt-3">
                If the Audit Committee does not respond, you can further appeal to the District Officer.
              </p>
            )}
          </div>
        </div>
      </div>
    ) : hasConcludedAppeal ? (
      <div
        className={`rounded-xl border p-5 ${
          complaint.appealStatus === "upheld"
            ? "border-emerald-200 bg-emerald-50/60"
            : "border-gray-200 bg-gray-50"
        }`}
      >
        <div className="flex items-start gap-3">
          {complaint.appealStatus === "upheld" ? (
            <CheckmarkCircle24Filled className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <Warning24Filled className="w-5 h-5 text-gray-500 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-900">
              Appeal {complaint.appealStatus === "upheld" ? "upheld" : "rejected"} —{" "}
              {complaint.appealedToLevel === 1 ? "Audit Committee" : "District Officer"}
            </h3>
            <p className="text-[13px] text-gray-600 mt-1">
              Reviewed on {formatDate(complaint.appealReviewedAt)}
            </p>
            {complaint.appealOutcome && (
              <p className="text-sm text-gray-700 mt-3 whitespace-pre-wrap">{complaint.appealOutcome}</p>
            )}
            {complaint.appealStatus === "rejected" && canStillAppeal && (
              <p className="text-[12px] text-gray-600 mt-3">
                You can still escalate further — see the appeal options below.
              </p>
            )}
          </div>
        </div>
      </div>
    ) : null;

  // Appeal form / eligibility card — hidden only when there is an active appeal,
  // or when the user has already exhausted internal authorities.
  const appealActionCard =
    !hasActiveAppeal && canStillAppeal ? (
      <div className="rounded-xl border border-gray-200 p-5">
        <div className="flex items-start gap-3">
          <ShieldTask24Regular className="w-5 h-5 text-violet-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-900">
              {complaint.appealStatus === "rejected"
                ? "Escalate to a higher authority"
                : "Appeal to a higher authority"}
            </h3>
            <p className="text-[13px] text-gray-600 mt-1">{hint}</p>

            {!formEligible && (
              <p className="text-[12px] text-gray-400 mt-2">
                The appeal option will become available automatically once you are eligible.
              </p>
            )}

            {formEligible && !showForm && (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md border border-violet-200 text-violet-700 bg-white hover:bg-violet-50 transition-colors"
              >
                File an appeal
              </button>
            )}

            {formEligible && showForm && (
              <div className="mt-4 space-y-3">
                {/* Target authority */}
                <div>
                  <label className="text-xs font-medium text-gray-700">Appeal to</label>
                  <div className="mt-1.5 flex flex-col gap-2">
                    {currentLevel < 1 && (
                      <label className="flex items-start gap-2 p-2.5 rounded-md border border-gray-200 cursor-pointer hover:bg-gray-50 has-checked:border-violet-400 has-checked:bg-violet-50/50">
                        <input
                          type="radio"
                          name="targetLevel"
                          value={1}
                          checked={targetLevel === 1}
                          onChange={() => setTargetLevel(1)}
                          className="mt-0.5"
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-900">Audit Committee</p>
                          <p className="text-[12px] text-gray-500">
                            Internal oversight. Recommended first step per Companies Act §177(9-10).
                          </p>
                        </div>
                      </label>
                    )}
                    <label className="flex items-start gap-2 p-2.5 rounded-md border border-gray-200 cursor-pointer hover:bg-gray-50 has-checked:border-violet-400 has-checked:bg-violet-50/50">
                      <input
                        type="radio"
                        name="targetLevel"
                        value={2}
                        checked={targetLevel === 2}
                        onChange={() => setTargetLevel(2)}
                        className="mt-0.5"
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-900">District Officer</p>
                        <p className="text-[12px] text-gray-500">
                          Statutory authority under POSH Act §6. Also notifies the Nodal Officer.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Reason */}
                <div>
                  <label className="text-xs font-medium text-gray-700">
                    Why are you appealing? <span className="text-gray-400">(min 20 characters)</span>
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Explain what the ICC did or didn't do, and what outcome you are seeking."
                    rows={5}
                    maxLength={2000}
                    className="mt-1.5 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400"
                    disabled={submitting}
                  />
                  <p className="text-[11px] text-gray-400 mt-1">{reason.length} / 2000</p>
                </div>

                {error && <p className="text-xs text-red-600">{error}</p>}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {submitting ? "Filing…" : "File appeal"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setError(null);
                    }}
                    disabled={submitting}
                    className="text-sm font-medium px-3 py-1.5 rounded-md text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>

                <p className="text-[11px] text-gray-400">
                  Your appeal and its reason will be logged in a tamper-proof audit trail and emailed to
                  the authority you select. The ICC Presiding Officer will be notified that you've
                  appealed.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    ) : !canStillAppeal && !hasActiveAppeal ? (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
        <p className="text-[13px] text-gray-600">
          You have appealed to the highest internal authority (District Officer). The rights below
          remain available to you at any time.
        </p>
      </div>
    ) : null;

  // External rights — ALWAYS visible. These apply in parallel to the internal
  // appeal and are never exhausted by internal actions.
  const externalRightsCard = (
    <div className="rounded-xl border border-gray-200 p-5 bg-linear-to-b from-white to-gray-50/50">
      <h3 className="text-sm font-semibold text-gray-900 mb-1">Your rights outside this system</h3>
      <p className="text-[13px] text-gray-600 mb-4">
        These options are always available to you — filing an internal appeal does not waive them, and
        you can pursue them in parallel.
      </p>

      <div className="space-y-3">
        {complaint.isCriminalThreshold && (
          <div className="flex items-start gap-3 p-3 rounded-lg border border-red-200 bg-red-50/60">
            <BuildingGovernment24Regular className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-900">File a police complaint (FIR)</p>
              <p className="text-[12px] text-red-800 mt-0.5">
                This complaint has been flagged as potentially involving criminal conduct under the
                Bharatiya Nyaya Sanhita, 2023 (Sections {complaint.bnsSections.join(", ") || "74–79"}).
                Under POSH Act §19(d), your employer is legally required to assist you in filing an FIR
                if you choose to. You can do this at any time, independent of the ICC process.
              </p>
            </div>
          </div>
        )}

        {!complaint.isCriminalThreshold && (
          <div className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 bg-white">
            <BuildingGovernment24Regular className="w-5 h-5 text-gray-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-gray-900">File a police complaint</p>
              <p className="text-[12px] text-gray-600 mt-0.5">
                If you believe the conduct constitutes a criminal offence under the Bharatiya Nyaya
                Sanhita, 2023 (e.g. §74–79), you can file an FIR directly. POSH Act §19 requires your
                employer to assist.
              </p>
            </div>
          </div>
        )}

        <div className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 bg-white">
          <Gavel24Regular className="w-5 h-5 text-gray-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-gray-900">Appeal to the courts</p>
            <p className="text-[12px] text-gray-600 mt-0.5">
              Under POSH Act §18, you have the right to approach the court/tribunal against the ICC's
              recommendations within <strong>90 days</strong> of receiving them.
              {complaint.resolvedAt && (
                <> Your 90-day window started on <strong>{formatDate(complaint.resolvedAt)}</strong>.</>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 bg-white">
          <ShieldTask24Regular className="w-5 h-5 text-gray-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-gray-900">SHe-Box (government portal)</p>
            <p className="text-[12px] text-gray-600 mt-0.5">
              You can also file your complaint on the Ministry of Women &amp; Child Development's
              SHe-Box portal at <span className="font-mono">shebox.wcd.gov.in</span>, which is monitored
              directly by the government.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {previousAppealCard}
      {appealActionCard}
      {externalRightsCard}
    </div>
  );
}
