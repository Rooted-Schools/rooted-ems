/**
 * Mapping `lead.source` onto the playbook's recruitment channels (PB 24 v2.2
 * s17.2), so lead performance can be judged against a benchmark instead of
 * against nothing.
 *
 * The two vocabularies were built independently and do not line up:
 *
 *   lead.source   website | event | referral | qr | ad | walk_in | staff | other
 *   playbook      referral | cbo | tour | event | ad | cold
 *
 * `lead.source` is a TEXT column with a comment, not an enum, so new values
 * need no migration. Two are added here:
 *   cbo   community partner referral, the playbook's second-best channel at
 *         15% and one the app simply could not record.
 *   tour  school tour walk-in, 12%, with a same-day follow-up standard.
 *
 * Judgement calls, stated rather than buried:
 *   walk_in -> tour     "walk in" in a school context almost always means
 *                       someone who came to look around. If a campus uses it
 *                       for something else, remap here rather than guessing.
 *   qr      -> cold     QR codes live on flyers and yard signs, which is the
 *                       cold-outreach channel.
 *   website -> null     Inbound organic web traffic has NO playbook benchmark.
 *                       It is deliberately unmapped rather than being forced
 *                       into "cold" at 5%, which would judge the channel
 *                       against a number the playbook never set for it.
 *   staff   -> null     Internal entry, not a recruitment channel.
 *   other   -> null     By definition unbenchmarkable.
 */

import { CHANNEL_BENCHMARKS } from "@/lib/playbook-targets";

export type PlaybookChannel = (typeof CHANNEL_BENCHMARKS)[number]["channel"];

/** Source values the app writes today, plus the two the playbook needs. */
export const LEAD_SOURCES = [
  "website",
  "event",
  "referral",
  "cbo",
  "tour",
  "qr",
  "ad",
  "walk_in",
  "staff",
  "other",
] as const;

export type LeadSource = (typeof LEAD_SOURCES)[number];

/** Null means "no playbook benchmark exists for this source", not "unknown". */
export const SOURCE_TO_CHANNEL: Record<LeadSource, PlaybookChannel | null> = {
  referral: "referral",
  cbo: "cbo",
  tour: "tour",
  walk_in: "tour",
  event: "event",
  ad: "ad",
  qr: "cold",
  website: null,
  staff: null,
  other: null,
};

export const SOURCE_LABEL: Record<LeadSource, string> = {
  website: "Website inquiry",
  event: "Event",
  referral: "Referral (family/alumni)",
  cbo: "Community partner / CBO",
  tour: "School tour",
  qr: "QR code (flyer/signage)",
  ad: "Digital ad",
  walk_in: "Walk-in",
  staff: "Staff entry",
  other: "Other",
};

const BENCHMARK_BY_CHANNEL = new Map(CHANNEL_BENCHMARKS.map((c) => [c.channel, c]));

export function benchmarkForSource(source: string) {
  const channel = SOURCE_TO_CHANNEL[source as LeadSource] ?? null;
  if (!channel) return null;
  return BENCHMARK_BY_CHANNEL.get(channel) ?? null;
}

/**
 * The playbook attaches follow-up standards to two channels: school tours
 * require SAME-DAY follow-up, event walk-ups WITHIN 24 HOURS.
 *
 * These are genuinely different deadlines and collapsing both to "24 hours"
 * would quietly relax the tour standard. A tour at 9am on Monday is late at
 * midnight Monday; an event lead at 9am Monday is late at 9am Tuesday. Returns
 * the actual deadline so callers cannot get this wrong.
 */
export function followUpDeadline(source: string, arrivedAt: Date): Date | null {
  const benchmark = benchmarkForSource(source);
  if (!benchmark?.emsSla) return null;

  if (benchmark.emsSla === "same_day") {
    const endOfDay = new Date(arrivedAt);
    endOfDay.setHours(23, 59, 59, 999);
    return endOfDay;
  }

  return new Date(arrivedAt.getTime() + 24 * 60 * 60 * 1000);
}

/** Human-readable standard for the UI, or null where the playbook sets none. */
export function followUpStandardLabel(source: string): string | null {
  const benchmark = benchmarkForSource(source);
  if (!benchmark?.emsSla) return null;
  return benchmark.emsSla === "same_day" ? "Same-day follow-up" : "Follow up within 24 hours";
}

export function isLeadSource(value: unknown): value is LeadSource {
  return typeof value === "string" && (LEAD_SOURCES as readonly string[]).includes(value);
}
