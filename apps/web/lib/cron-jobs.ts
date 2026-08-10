/**
 * Registry of every scheduled automation, mirroring apps/web/vercel.json.
 * Drives the Automation health card on /staff/settings and the heartbeat
 * stamps in lib/cron-heartbeat.ts.
 *
 * cadenceMinutes is the EXPECTED gap between runs (from the cron schedule).
 * The health card flags a job as overdue when the last stamp is older than
 * 2x its cadence — late enough to be a real signal, tolerant of slow runs.
 *
 * Pure data, safe to import from client components.
 */

export interface CronJobInfo {
  /** Stable key used in the setting table: `cron:last_run:<key>` */
  key: string;
  /** Route path under /api/cron/ (for reference, not fetched client-side) */
  path: string;
  label: string;
  /** One plain-English sentence: what this automation does for staff. */
  purpose: string;
  cadenceMinutes: number;
}

export const CRON_JOBS: CronJobInfo[] = [
  {
    key: "expire-offers",
    path: "/api/cron/expire-offers",
    label: "Offer expiry",
    purpose: "Expires overdue seat offers and promotes the next family from the waitlist.",
    cadenceMinutes: 24 * 60,
  },
  {
    key: "offer-reminders",
    path: "/api/cron/offer-reminders",
    label: "Offer reminders",
    purpose: "Reminds families whose seat offer deadline is approaching.",
    cadenceMinutes: 24 * 60,
  },
  {
    key: "nudge-registrations",
    path: "/api/cron/nudge-registrations",
    label: "Registration nudges",
    purpose: "Nudges families with unfinished registration packets.",
    cadenceMinutes: 24 * 60,
  },
  {
    key: "reengage-leads",
    path: "/api/cron/reengage-leads",
    label: "Lead re-engagement",
    purpose: "Sends one warm check-in to interested families who went quiet.",
    cadenceMinutes: 24 * 60,
  },
  {
    key: "send-campaigns",
    path: "/api/cron/send-campaigns",
    label: "Campaign sender",
    purpose: "Delivers scheduled recruitment campaign batches.",
    cadenceMinutes: 24 * 60,
  },
  {
    key: "sync-lead-sheets",
    path: "/api/cron/sync-lead-sheets",
    label: "Lead sheet sync",
    purpose: "Imports new interest-form signups from campus Google Sheets.",
    cadenceMinutes: 24 * 60,
  },
  {
    key: "purge-stale-leads",
    path: "/api/cron/purge-stale-leads",
    label: "Data retention purge",
    purpose: "Removes never-converted leads past the retention window.",
    cadenceMinutes: 31 * 24 * 60,
  },
  {
    key: "run-journeys",
    path: "/api/cron/run-journeys",
    label: "Journey engine",
    purpose: "Advances nurture journeys: sends the next step or completes the sequence.",
    cadenceMinutes: 24 * 60,
  },
  {
    key: "event-followups",
    path: "/api/cron/event-followups",
    label: "Event reminders & follow-ups",
    purpose: "Sends RSVP reminders before events and follow-ups the morning after.",
    cadenceMinutes: 60,
  },
  {
    key: "keep-the-seat",
    path: "/api/cron/keep-the-seat",
    label: "Keep-the-seat",
    purpose: "Sends the post-registration welcome that fights summer melt.",
    cadenceMinutes: 24 * 60,
  },
];
