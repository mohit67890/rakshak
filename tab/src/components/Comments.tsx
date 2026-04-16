/**
 * Raksha Tab — Comments Component
 *
 * Displays comments on a complaint and allows adding new ones.
 * Used by both ComplaintDetail (employee) and IccCaseView (ICC).
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  getComments,
  addComment,
  type Comment,
} from "../services/apiClient";

interface CommentsProps {
  complaintId: string;
  tenantId: string;
  userId: string;
  userName: string;
  role: "employee" | "icc";
  /** Whether the complaint is in a state that allows comments (not draft) */
  allowNew?: boolean;
}

export function Comments({
  complaintId,
  tenantId,
  userId,
  userName,
  role,
  allowNew = true,
}: CommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchComments = useCallback(async () => {
    try {
      const data = await getComments(complaintId, tenantId, userId, role);
      setComments(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [complaintId, tenantId, userId, role]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const handleSubmit = async () => {
    const trimmed = newComment.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const comment = await addComment(complaintId, tenantId, userId, userName, role, trimmed);
      setComments((prev) => [...prev, comment]);
      setNewComment("");
      // Auto-resize textarea back
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Cmd/Ctrl+Enter to submit
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const autoResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    setNewComment(el.value);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4">
        <div className="h-3 w-3 rounded-full bg-gray-300 animate-pulse" />
        <span className="text-sm text-gray-400">Loading comments...</span>
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-red-600 py-2">Failed to load comments: {error}</p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Comment list */}
      {comments.length === 0 && !allowNew && (
        <p className="text-sm text-gray-500">No comments yet.</p>
      )}

      {comments.length === 0 && allowNew && (
        <p className="text-sm text-gray-400">No comments yet. Be the first to add one.</p>
      )}

      <AnimatePresence initial={false}>
        {comments.map((comment) => (
          <motion.div
            key={comment.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="group"
          >
            <div className="flex gap-3">
              {/* Avatar */}
              <div
                className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                  comment.authorRole === "icc"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-violet-100 text-violet-700"
                }`}
              >
                {getInitials(comment.authorName)}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-gray-900">
                    {comment.authorName}
                    {comment.authorId === userId && (
                      <span className="text-gray-400 font-normal"> (you)</span>
                    )}
                  </span>
                  {comment.authorRole === "icc" && (
                    <span className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">
                      ICC
                    </span>
                  )}
                  <span className="text-xs text-gray-400">
                    {formatCommentTime(comment.createdAt)}
                  </span>
                </div>
                <p className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap leading-relaxed">
                  {comment.content}
                </p>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* New comment input */}
      {allowNew && (
        <div className="pt-2">
          <div className="flex gap-3">
            <div
              className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                role === "icc"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-violet-100 text-violet-700"
              }`}
            >
              {getInitials(userName)}
            </div>

            <div className="flex-1 min-w-0">
              <textarea
                ref={textareaRef}
                value={newComment}
                onChange={autoResize}
                onKeyDown={handleKeyDown}
                placeholder="Add a comment..."
                rows={1}
                maxLength={5000}
                disabled={submitting}
                className="w-full text-sm text-gray-900 placeholder-gray-400 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-colors disabled:opacity-50"
              />

              {newComment.trim() && (
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-gray-400">
                    {newComment.trim().length}/5000 · Ctrl+Enter to send
                  </span>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !newComment.trim()}
                    className="text-sm font-medium px-3 py-1 rounded-md bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {submitting ? "Posting..." : "Post"}
                  </button>
                </div>
              )}

              {submitError && (
                <p className="text-xs text-red-600 mt-1">{submitError}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (name[0] || "?").toUpperCase();
}

function formatCommentTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}
