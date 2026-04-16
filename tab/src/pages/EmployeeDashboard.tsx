/**
 * Raksha Tab — My Cases
 *
 * Shows the employee's own complaints with status.
 * Warm empty state that guides, not alienates.
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FolderOpen24Regular,
  ChatBubblesQuestion24Regular,
  BookOpen24Regular,
} from "@fluentui/react-icons";
import { useCurrentUser } from "../context/AuthContext";
import { getComplaints, type Complaint } from "../services/apiClient";
import { ComplaintCard } from "../components/ComplaintCard";
import { Loading } from "../components/Loading";
import { ErrorBanner } from "../components/ErrorBanner";
import { openBotChat } from "../utils/openBotChat";

export function EmployeeDashboard() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useCurrentUser();
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getComplaints(user.tenantId, user.userId, "employee");
      setComplaints(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading && user) fetchData();
  }, [authLoading, user, fetchData]);

  if (authLoading) return <Loading message="Loading your profile..." />;

  return (
    <div className="max-w-5xl mx-auto px-5 py-8">
      <div className="flex items-center gap-2 mb-6">
        <h1 className="text-xl font-semibold text-gray-900">My Cases</h1>
      </div>

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <Loading message="Loading your cases..." />
      ) : complaints.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-16"
        >
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-gray-100 mb-4">
            <FolderOpen24Regular className="w-6 h-6 text-gray-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">No cases yet</h2>
          <p className="text-[13px] text-gray-500 max-w-sm mx-auto leading-relaxed mb-6">
            When you report a concern through the Rakshak bot, your case will appear here with real-time status updates.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button
              onClick={() => openBotChat("Hi")}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <ChatBubblesQuestion24Regular className="w-4 h-4" />
              Report a Concern
            </button>
            <button
              onClick={() => navigate("/rights")}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-gray-600 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <BookOpen24Regular className="w-4 h-4" />
              Learn About Your Rights
            </button>
          </div>
        </motion.div>
      ) : (
          <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-2"
        >
          {complaints.map((c) => (
              <ComplaintCard
                key={c.id}
                complaint={c}
                onClick={() => navigate(`/complaint/${c.id}`)}
              />
          ))}
        </motion.div>
      )}
    </div>
  );
}
