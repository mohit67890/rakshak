/**
 * Raksha Tab — API Client
 *
 * Typed client for the Raksha Azure Functions API.
 * Uses fetch() with the base URL resolved from environment.
 *
 * TODO: Add Entra ID bearer token to Authorization header once SSO is implemented.
 */

// Base URL: in dev, Vite proxy handles /api → localhost:7071.
// In production, this should point to the deployed Azure Functions URL.
const API_BASE = "/api";

// ============================================================================
// Types (mirrored from API, kept minimal for the tab)
// ============================================================================

export interface Complaint {
  id: string;
  tenantId: string;
  complainantId: string;
  complainantName: string;
  complaintNumber: string;
  status: string;
  severity: string;
  category: string;
  incidentDate: string;
  incidentLocation: string;
  description: string;
  accusedPersons: Array<{ name: string; designation: string; department: string; relationship: string }>;
  witnesses: Array<{ name: string; designation: string }>;
  evidenceUrls: string[];
  poshSections: string[];
  bnsSections: string[];
  isCriminalThreshold: boolean;
  assignedIccId: string | null;
  escalationLevel: number;
  submittedAt: string;
  acknowledgedAt: string | null;
  acknowledgeDeadline: string;
  inquiryStartedAt: string | null;
  inquiryDeadline: string;
  resolvedAt: string | null;
  resolution: string | null;
  complaintPdfUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEntry {
  id: string;
  complaintId: string;
  action: string;
  performedBy: string;
  performedByRole: string;
  details: Record<string, unknown>;
  timestamp: string;
}

export interface DashboardSummary {
  total: number;
  submitted: number;
  under_inquiry: number;
  resolved: number;
  escalated: number;
  closed: number;
}

export interface DashboardData {
  summary: DashboardSummary;
  recent: Complaint[];
  overdue: Complaint[];
  inquiryBreached: Complaint[];
}

export interface UserRole {
  userId: string;
  tenantId: string;
  role: "employee" | "icc";
  iccRole: string | null;
}

// ============================================================================
// API Methods
// ============================================================================

/** Get the current user's role (employee or icc) based on iccConfig membership */
export async function getUserRole(tenantId: string, userId: string): Promise<UserRole> {
  const params = new URLSearchParams({ tenantId, userId });
  return fetchJson(`${API_BASE}/me?${params}`);
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function patchJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errBody.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** Get complaints for a user (employee sees own, ICC sees all non-draft) */
export async function getComplaints(
  tenantId: string,
  userId: string,
  role: "employee" | "icc",
): Promise<Complaint[]> {
  const params = new URLSearchParams({ tenantId, userId, role });
  const data = await fetchJson<{ complaints: Complaint[] }>(`${API_BASE}/complaints?${params}`);
  return data.complaints;
}

/** Get a single complaint with full audit timeline */
export async function getComplaintById(
  complaintId: string,
  tenantId: string,
  userId: string,
  role: "employee" | "icc",
): Promise<{ complaint: Complaint; timeline: AuditEntry[] }> {
  const params = new URLSearchParams({ tenantId, userId, role });
  return fetchJson(`${API_BASE}/complaints/${encodeURIComponent(complaintId)}?${params}`);
}

/** Get ICC dashboard data */
export async function getIccDashboard(
  tenantId: string,
  userId: string,
): Promise<DashboardData> {
  const params = new URLSearchParams({ tenantId, userId });
  return fetchJson(`${API_BASE}/icc/dashboard?${params}`);
}

/** ICC acknowledges a complaint */
export async function acknowledgeComplaint(
  complaintId: string,
  tenantId: string,
): Promise<void> {
  await patchJson(`${API_BASE}/complaints/${encodeURIComponent(complaintId)}/status`, {
    tenantId,
    status: "acknowledged",
  });
}

/** ICC resolves a complaint */
export async function resolveComplaint(
  complaintId: string,
  tenantId: string,
  resolution: string,
): Promise<void> {
  await patchJson(`${API_BASE}/complaints/${encodeURIComponent(complaintId)}/status`, {
    tenantId,
    status: "resolved",
    resolution,
  });
}

/** Upload an evidence file to a complaint */
export interface UploadEvidenceResult {
  success: boolean;
  fileName: string;
  blobUrl: string;
  totalCount: number;
}

export async function uploadEvidence(
  complaintId: string,
  tenantId: string,
  userId: string,
  file: File,
): Promise<UploadEvidenceResult> {
  const params = new URLSearchParams({ tenantId, userId });
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(
    `${API_BASE}/complaints/${encodeURIComponent(complaintId)}/evidence?${params}`,
    { method: "POST", body: formData },
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Upload failed: HTTP ${res.status}`);
  }

  return res.json() as Promise<UploadEvidenceResult>;
}

// ============================================================================
// Comments
// ============================================================================

export interface Comment {
  id: string;
  complaintId: string;
  tenantId: string;
  authorId: string;
  authorName: string;
  authorRole: "employee" | "icc";
  content: string;
  createdAt: string;
}

/** Get all comments for a complaint */
export async function getComments(
  complaintId: string,
  tenantId: string,
  userId: string,
  role: "employee" | "icc",
): Promise<Comment[]> {
  const params = new URLSearchParams({ tenantId, userId, role });
  const data = await fetchJson<{ comments: Comment[] }>(
    `${API_BASE}/complaints/${encodeURIComponent(complaintId)}/comments?${params}`,
  );
  return data.comments;
}

/** Add a comment to a complaint */
export async function addComment(
  complaintId: string,
  tenantId: string,
  userId: string,
  userName: string,
  role: "employee" | "icc",
  content: string,
): Promise<Comment> {
  const res = await fetch(
    `${API_BASE}/complaints/${encodeURIComponent(complaintId)}/comments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId, userId, userName, role, content }),
    },
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  const data = await res.json() as { comment: Comment };
  return data.comment;
}
