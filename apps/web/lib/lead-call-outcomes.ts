/**
 * Structured call outcome vocabulary for the "Log a call" dialog
 * (app/staff/recruitment/[id]/lead-detail-client.tsx) — a single source of
 * truth for the outcome labels, the follow-up cadence each one implies, and
 * how they're encoded into a lead_activity.body ("[Reached] ...") so the
 * timeline stays human-readable while still being machine-derivable. The
 * "wrong number" phone flag and the follow-up queue's "callback due"
 * grouping (lib/queries/leads.ts getFollowUpQueue) both read the same prefix
 * back out via bodyHasOutcome instead of trusting a second, driftable signal.
 *
 * Why outcomes carry a cadence: a recruiter works from "who do I call today",
 * so the outcome of one call has to decide when the next one happens. Before
 * this, only "Call back later" scheduled anything and every other outcome
 * cleared the follow-up date, which silently dropped the family off the queue
 * after a single voicemail. Each outcome now has a sensible default the
 * recruiter can override per call.
 *
 * Deliberately dependency-free (no Supabase client, no next/headers) so it
 * can be imported directly by "use client" components — see
 * lib/queries/utils.ts formatRelativeTime for the same pattern, and its
 * comment on why the "@/lib/queries" barrel itself is off-limits to client
 * components (it re-exports server-only queries that reach next/headers).
 */

export const CALL_OUTCOMES = [
  // Reached: the conversation happened, so the next touch is a nurture-cadence
  // check-in rather than another attempt to make contact.
  { key: "reached", label: "Reached", defaultFollowUpDays: 30 },
  // No answer: try again in a couple of days while interest is still warm.
  { key: "voicemail", label: "Left voicemail", defaultFollowUpDays: 2 },
  // A bad number can't be dialled again — no follow-up until someone fixes it.
  { key: "wrong_number", label: "Wrong number", defaultFollowUpDays: null },
  // The family named a time; the dialog collects that exact date instead of
  // applying an interval, so the default here is intentionally null.
  { key: "callback", label: "Call back later", defaultFollowUpDays: null },
] as const;

export type CallOutcomeKey = (typeof CALL_OUTCOMES)[number]["key"];

/** Intervals offered in the dialog. Covers every outcome default above so a
 *  pre-selected default is always a real option in the list. */
export const FOLLOW_UP_OPTIONS = [
  { label: "Tomorrow", days: 1 },
  { label: "In 2 days", days: 2 },
  { label: "In 3 days", days: 3 },
  { label: "Next week", days: 7 },
  { label: "In 2 weeks", days: 14 },
  { label: "In a month", days: 30 },
  { label: "No follow-up needed", days: null },
] as const;

function outcomeLabel(key: string): string {
  return CALL_OUTCOMES.find((o) => o.key === key)?.label ?? key;
}

/** Days until the next touch this outcome implies, or null for "none".
 *  Unknown keys get null rather than an invented cadence. */
export function defaultFollowUpDaysFor(key: string): number | null {
  return CALL_OUTCOMES.find((o) => o.key === key)?.defaultFollowUpDays ?? null;
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

function toLocalYmd(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Interval-based follow-ups land at the start of the day so they show up in
 *  the morning queue — an interval measured from the exact moment of the call
 *  would hide an "in 2 days" lead until mid-afternoon of the day it's due,
 *  after the recruiter has already worked their list. */
export const DEFAULT_FOLLOW_UP_TIME = "09:00";

/** Local timestamp for a yyyy-mm-dd at an HH:MM (24h) wall-clock time. */
function atLocalTime(ymd: string, hhmm: string = DEFAULT_FOLLOW_UP_TIME): string {
  const time = /^\d{2}:\d{2}$/.test(hhmm) ? hhmm : DEFAULT_FOLLOW_UP_TIME;
  return new Date(`${ymd}T${time}:00`).toISOString();
}

export interface NextFollowUpInput {
  outcomeKey: string;
  /** yyyy-mm-dd the recruiter picked; only read for the "callback" outcome. */
  callbackDate?: string;
  /** HH:MM (24h) the family actually named, e.g. "14:00" for "call me back at
   *  2pm". Only read for the "callback" outcome; defaults to the start of the
   *  day when the family named a day but not an hour. */
  callbackTime?: string;
  /** Recruiter's per-call override. `undefined` means "use the outcome
   *  default"; an explicit `null` means "no follow-up". */
  overrideDays?: number | null;
  /** Injectable for tests. */
  now?: Date;
}

/**
 * The next follow-up timestamp a logged call should produce, or null when the
 * outcome deliberately schedules nothing. Returns null for a "callback" with
 * no date so the caller can surface a validation error rather than silently
 * writing a wrong date.
 */
export function computeNextFollowUp({
  outcomeKey,
  callbackDate,
  callbackTime,
  overrideDays,
  now = new Date(),
}: NextFollowUpInput): string | null {
  if (outcomeKey === "callback") {
    return callbackDate ? atLocalTime(callbackDate, callbackTime) : null;
  }

  const days = overrideDays !== undefined ? overrideDays : defaultFollowUpDaysFor(outcomeKey);
  if (days === null) return null;

  const target = new Date(now.getTime());
  target.setDate(target.getDate() + days);
  return atLocalTime(toLocalYmd(target));
}
