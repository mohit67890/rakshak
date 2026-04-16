/**
 * Raksha Tab — Shared UI helpers
 *
 * Reusable Section, Field, and formatDate used across
 * ComplaintDetail and IccCaseView pages. Single source of truth
 * for detail-page styling.
 */

/**
 * A labelled section with consistent heading size.
 * Used in complaint detail and ICC case view pages.
 */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">{title}</h3>
      {children}
    </div>
  );
}

/**
 * A label + value pair shown in a 2-column grid.
 */
export function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[13px] text-gray-500">{label}</p>
      <p className="text-sm text-gray-900 capitalize">{value}</p>
    </div>
  );
}

/**
 * Format an ISO date string for Indian locale.
 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
