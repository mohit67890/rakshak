/**
 * Raksha Tab — ICC Dashboard
 *
 * ICC members see all complaints with summary stats,
 * overdue alerts, and ability to navigate to cases.
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Warning24Filled,
  Clock24Regular,
} from "@fluentui/react-icons";
import { useCurrentUser } from "../context/AuthContext";
import { getIccDashboard, type DashboardData, type Complaint } from "../services/apiClient";
import { ComplaintCard } from "../components/ComplaintCard";
import { Loading } from "../components/Loading";
import { ErrorBanner } from "../components/ErrorBanner";

export function IccDashboard() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useCurrentUser();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const dashboard = await getIccDashboard(user.tenantId, user.userId);
      setData(dashboard);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading && user) fetchData();
  }, [authLoading, user, fetchData]);

  if (authLoading) return <Loading message="Loading profile..." />;

  return (
    <div className="max-w-5xl mx-auto px-5 py-8">
      <div className="flex items-center gap-2 mb-6">
        <h1 className="text-xl font-semibold text-gray-900">ICC Dashboard</h1>
      </div>

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <Loading message="Loading dashboard..." />
      ) : data ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {/* Summary Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-gray-200 rounded-lg overflow-hidden border border-gray-200 mb-8">
            <StatCard label="Total" count={data.summary.total} color="violet" />
            <StatCard label="Submitted" count={data.summary.submitted} color="amber" />
            <StatCard label="Under Inquiry" count={data.summary.under_inquiry} color="sky" />
            <StatCard label="Resolved" count={data.summary.resolved} color="emerald" />
            <StatCard label="Escalated" count={data.summary.escalated} color="red" />
          </div>

          {/* Overdue Alerts */}
          {data.overdue.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <Warning24Filled className="text-red-500 w-5 h-5" />
                <h2 className="text-sm font-semibold text-gray-900">Overdue — Awaiting Acknowledgement</h2>
                <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                  {data.overdue.length}
                </span>
              </div>
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg mb-3">
                <p className="text-sm text-red-700">
                  These complaints have passed their acknowledgement deadline. Immediate action is required.
                </p>
              </div>
              <ComplaintList
                complaints={data.overdue}
                onSelect={(id) => navigate(`/icc/case/${id}`)}
              />
            </div>
          )}

          {/* Inquiry Deadline Breached */}
          {data.inquiryBreached.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <Clock24Regular className="text-amber-600 w-5 h-5" />
                <h2 className="text-sm font-semibold text-gray-900">Inquiry Deadline Breached</h2>
                <span className="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                  {data.inquiryBreached.length}
                </span>
              </div>
              <ComplaintList
                complaints={data.inquiryBreached}
                onSelect={(id) => navigate(`/icc/case/${id}`)}
              />
            </div>
          )}

          <hr className="my-6 border-gray-200" />

          {/* Recent Complaints */}
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Recent Complaints</h2>
            {data.recent.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">
                No complaints filed yet.
              </p>
            ) : (
              <ComplaintList
                complaints={data.recent}
                onSelect={(id) => navigate(`/icc/case/${id}`)}
              />
            )}
          </div>
        </motion.div>
      ) : null}
    </div>
  );
}

// ── Sub-components ──

function StatCard({ label, count, color }: { label: string; count: number; color: string }) {
  const colorMap: Record<string, string> = {
    violet: "text-violet-600",
    amber: "text-amber-600",
    sky: "text-sky-600",
    emerald: "text-emerald-600",
    red: "text-red-600",
  };
  return (
    <div className="p-3 bg-white text-center">
      <p className={`text-xl font-semibold ${colorMap[color] ?? "text-gray-900"}`}>{count}</p>
      <p className="text-[13px] text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

function ComplaintList({
  complaints,
  onSelect,
}: {
  complaints: Complaint[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      {complaints.map((c) => (
        <ComplaintCard
          key={c.id}
          complaint={c}
          onClick={() => onSelect(c.id)}
          showComplainant
        />
      ))}
    </div>
  );
}
