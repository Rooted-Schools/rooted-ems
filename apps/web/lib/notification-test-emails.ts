import type { EmailTemplate } from "@/lib/email-templates";
import * as t from "@/lib/email-templates";

/**
 * Test-send catalog for every automated family notification email.
 *
 * Each entry renders one of the real templates from lib/email-templates.ts
 * with representative SAMPLE data, so staff can send themselves a copy of any
 * notification and see exactly what a family would receive — without waiting
 * for the real trigger (an offer, a lottery result, an abandoned draft) to
 * occur. Campus name / logo / contact come from the actually-selected campus
 * (passed in as context); everything student-, offer-, or event-specific is
 * sample data defined here in one place.
 *
 * These are previews: the sender is the staff member themselves and the send
 * is NOT written to email_event / communication_log (see the action), so a
 * test can never be mistaken for a message a family received.
 */

export interface NotificationTestContext {
  campusName: string;
  campusLogoUrl?: string;
  campusEmail?: string | null;
  campusPhone?: string | null;
  timeZone?: string | null;
}

export interface NotificationTestTemplate {
  key: string;
  label: string;
  group: string;
  build: (ctx: NotificationTestContext) => EmailTemplate;
}

// ── Sample data (one place) ────────────────────────────────────────────────
const STUDENT = "Jordan";
const GUARDIAN = "Alex";
const daysFromNow = (n: number): string => new Date(Date.now() + n * 86_400_000).toISOString();
const SAMPLE_EVENT = "Campus Tour & Info Session";
const SAMPLE_WHEN = "Saturday, March 14 · 10:00 AM";
const SAMPLE_LOCATION = "Main Campus";

export const NOTIFICATION_TEST_TEMPLATES: NotificationTestTemplate[] = [
  // ── Inquiry & application ────────────────────────────────────────────────
  {
    key: "inquiryWelcome",
    label: "Inquiry welcome",
    group: "Inquiry & application",
    build: (c) => t.inquiryWelcome({ guardianFirstName: GUARDIAN, campusName: c.campusName, campusLogoUrl: c.campusLogoUrl }),
  },
  {
    key: "applicationReceived",
    label: "Application received",
    group: "Inquiry & application",
    build: (c) =>
      t.applicationReceived({
        studentFirstName: STUDENT,
        campusName: c.campusName,
        campusLogoUrl: c.campusLogoUrl,
        campusEmail: c.campusEmail,
        campusPhone: c.campusPhone,
      }),
  },
  {
    key: "draftReminder",
    label: "Draft application reminder",
    group: "Inquiry & application",
    build: (c) =>
      t.draftReminder({ studentFirstName: STUDENT, campusName: c.campusName, closeDate: daysFromNow(10), campusLogoUrl: c.campusLogoUrl }),
  },
  {
    key: "leadReengagement",
    label: "Lead re-engagement",
    group: "Inquiry & application",
    build: (c) => t.leadReengagement({ guardianFirstName: GUARDIAN, campusName: c.campusName, campusLogoUrl: c.campusLogoUrl }),
  },

  // ── Lottery & offers ─────────────────────────────────────────────────────
  {
    key: "lotteryResultWaitlisted",
    label: "Lottery result: waitlisted",
    group: "Lottery & offers",
    build: (c) => t.lotteryResultWaitlisted({ studentFirstName: STUDENT, campusName: c.campusName, position: 7, campusLogoUrl: c.campusLogoUrl }),
  },
  {
    key: "waitlistPositionImproved",
    label: "Waitlist position improved",
    group: "Lottery & offers",
    build: (c) => t.waitlistPositionImproved({ studentFirstName: STUDENT, campusName: c.campusName, position: 3, campusLogoUrl: c.campusLogoUrl }),
  },
  {
    key: "waitlistPromoted",
    label: "Waitlist promoted to an offer",
    group: "Lottery & offers",
    build: (c) =>
      t.waitlistPromoted({
        studentFirstName: STUDENT,
        campusName: c.campusName,
        campusLogoUrl: c.campusLogoUrl,
        expiresAt: daysFromNow(5),
        timeZone: c.timeZone,
      }),
  },
  {
    key: "offerExtended",
    label: "Offer extended",
    group: "Lottery & offers",
    build: (c) =>
      t.offerExtended({ studentFirstName: STUDENT, campusName: c.campusName, expiresAt: daysFromNow(5), campusLogoUrl: c.campusLogoUrl, timeZone: c.timeZone }),
  },
  {
    key: "offerExpiringSoon",
    label: "Offer expiring soon",
    group: "Lottery & offers",
    build: (c) =>
      t.offerExpiringSoon({ studentFirstName: STUDENT, campusName: c.campusName, expiresAt: daysFromNow(2), campusLogoUrl: c.campusLogoUrl, timeZone: c.timeZone }),
  },
  {
    key: "offerAccepted",
    label: "Offer accepted",
    group: "Lottery & offers",
    build: (c) => t.offerAccepted({ studentFirstName: STUDENT, campusName: c.campusName, campusLogoUrl: c.campusLogoUrl }),
  },

  // ── Registration & enrollment ────────────────────────────────────────────
  {
    key: "registrationComplete",
    label: "Registration complete",
    group: "Registration & enrollment",
    build: (c) => t.registrationComplete({ studentFirstName: STUDENT, campusName: c.campusName, campusLogoUrl: c.campusLogoUrl }),
  },
  {
    key: "registrationNudge",
    label: "Registration nudge (missing items)",
    group: "Registration & enrollment",
    build: (c) =>
      t.registrationNudge({
        studentFirstName: STUDENT,
        campusName: c.campusName,
        missingNames: ["Proof of residency", "Immunization records"],
        campusLogoUrl: c.campusLogoUrl,
      }),
  },
  {
    key: "keepTheSeat",
    label: "Keep the seat",
    group: "Registration & enrollment",
    build: (c) => t.keepTheSeat({ studentFirstName: STUDENT, campusName: c.campusName, startDate: daysFromNow(30), campusLogoUrl: c.campusLogoUrl }),
  },
  {
    key: "reenrollmentPulse",
    label: "Re-enrollment pulse",
    group: "Registration & enrollment",
    build: (c) =>
      t.reenrollmentPulse({ studentFirstName: STUDENT, campusName: c.campusName, nextSchoolYearName: "2027-28", campusLogoUrl: c.campusLogoUrl }),
  },

  // ── Events ───────────────────────────────────────────────────────────────
  {
    key: "eventRsvpConfirmation",
    label: "Event RSVP confirmation",
    group: "Events",
    build: (c) =>
      t.eventRsvpConfirmation({ guardianFirstName: GUARDIAN, campusName: c.campusName, eventTitle: SAMPLE_EVENT, whenText: SAMPLE_WHEN, location: SAMPLE_LOCATION }),
  },
  {
    key: "eventReminder",
    label: "Event reminder",
    group: "Events",
    build: (c) =>
      t.eventReminder({
        guardianFirstName: GUARDIAN,
        campusName: c.campusName,
        eventTitle: SAMPLE_EVENT,
        whenText: SAMPLE_WHEN,
        location: SAMPLE_LOCATION,
        urgency: "day_before",
      }),
  },
  {
    key: "eventFollowupAttended",
    label: "Event follow-up: attended",
    group: "Events",
    build: (c) => t.eventFollowupAttended({ guardianFirstName: GUARDIAN, campusName: c.campusName, eventTitle: SAMPLE_EVENT }),
  },
  {
    key: "eventFollowupNoShow",
    label: "Event follow-up: no-show",
    group: "Events",
    build: (c) => t.eventFollowupNoShow({ guardianFirstName: GUARDIAN, campusName: c.campusName, eventTitle: SAMPLE_EVENT }),
  },
];

/** Lookup by key, for the send action. */
export function findNotificationTestTemplate(key: string): NotificationTestTemplate | undefined {
  return NOTIFICATION_TEST_TEMPLATES.find((t) => t.key === key);
}

/** Metadata only (no build fns) — safe to pass from a server component to the client. */
export function notificationTestTemplateList(): { key: string; label: string; group: string }[] {
  return NOTIFICATION_TEST_TEMPLATES.map(({ key, label, group }) => ({ key, label, group }));
}
