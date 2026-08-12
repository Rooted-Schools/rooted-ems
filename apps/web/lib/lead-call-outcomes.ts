/**
 * Structured call outcome vocabulary for the "Log a call" dialog
 * (app/staff/recruitment/[id]/lead-detail-client.tsx) — a single source of
 * truth for the outcome labels and how they're encoded into a
 * lead_activity.body ("[Reached] ...") so the timeline stays human-readable
 * while still being machine-derivable. The "wrong number" phone flag and the
 * follow-up queue's "callback due" grouping (lib/queries/leads.ts
 * getFollowUpQueue) both read the same prefix back out via bodyHasOutcome
 * instead of trusting a second, driftable signal.
 *
 * Deliberately dependency-free (no Supabase client, no next/headers) so it
 * can be imported directly by "use client" components — see
 * lib/queries/utils.ts formatRelativeTime for the same pattern, and its
 * comment on why the "@/lib/queries" barrel itself is off-limits to client
 * components (it re-exports server-only queries that reach next/headers).
 */

export const CALL_OUTCOMES = [
  { key: "reached", label: "Reached" },
  { key: "voicemail", label: "Left voicemail" },
  { key: "wrong_number", label: "Wrong number" },
  { key: "callback", label: "Call back later" },
] as const;

export type CallOutcomeKey = (typeof CALL_OUTCOMES)[number]["key"];

function outcomeLabel(key: string): string {
  return CALL_OUTCOMES.find((o) => o.key === key)?.label ?? key;
}

/** e.g. "[Reached] Spoke with mom, very interested." or just "[Left voicemail]" with no note. */
export function buildCallOutcomeBody(outcomeKey: string, note: string): string {
  const label = outcomeLabel(outcomeKey);
  const trimmed = note.trim();
  return trimmed ? `[${label}] ${trimmed}` : `[${label}]`;
}

/** Was this activity body produced by buildCallOutcomeBody for `outcomeKey`? */
export function bodyHasOutcome(body: string | null | undefined, outcomeKey: string): boolean {
  return (body ?? "").startsWith(`[${outcomeLabel(outcomeKey)}]`);
}
