/**
 * Read-only registry of every automated, family-facing message the system
 * sends — rendered with sample data so staff can answer "what did the
 * family get?" without asking a developer.
 *
 * Powers /staff/communications/automated-messages.
 *
 * EMAIL: every entry below calls the real, exported template function from
 * lib/email-templates.ts with sample data. Nothing is retyped — if the copy
 * changes there, this page changes with it.
 *
 * SMS: SMS bodies are NOT separate functions in most of the codebase — they
 * are written inline at each send site in lib/notify.ts, inline in
 * app/api/cron/event-followups/route.ts, and (one exception) as the
 * exported registrationNudgeSms() in lib/nudge-copy.ts. This file
 * TRANSCRIBES those inline bodies, character-for-character, into small
 * render functions below. lib/notify.ts and the event-followups cron route
 * remain the source of truth for SMS copy — if either changes, the matching
 * render function here must be updated by hand in the same change. This
 * file is a mirror, never the source. Do NOT refactor lib/notify.ts to
 * import from here.
 */

import * as emailTemplates from "@/lib/email-templates";
import type { EmailTemplate } from "@/lib/email-templates";
import { registrationNudgeSms as realRegistrationNudgeSms } from "@/lib/nudge-copy";

// ─── Sample data ────────────────────────────────────────────────────────────
// One illustrative family, reused everywhere so the preview reads as a
// single coherent story rather than a pile of disconnected fixtures.

export const SAMPLE = {
  studentFirstName: "Jordan",
  studentFullName: "Jordan Rivera",
  guardianFirstName: "Alex",
  campusName: "Rooted Schools Cleveland",
  grade: "6",
  position: 3,
  missingNames: ["Immunization Records", "Emergency Contact"] as string[],
  count: 2 as number,
  eventTitle: "Fall Open House",
  eventLocation: "Rooted Schools Cleveland — Main Campus",
  /** Illustrative future offer/registration deadline. */
  offerDeadlineIso: "2026-09-15T23:59:00.000Z",
  /** Illustrative first day of the coming school year (keep-the-seat). */
  schoolYearStartIso: "2026-08-24T00:00:00.000Z",
  /** Illustrative event start time (RSVP confirmation, reminders, follow-ups). */
  eventStartsAtIso: "2026-09-10T18:00:00.000Z",
  /** Illustrative next event, for the no-show follow-up's "join us next" branch. */
  nextEventTitle: "Winter Open House",
  nextEventStartsAtIso: "2026-11-12T18:00:00.000Z",
  nextSchoolYearName: "2027-28",
  documentTypeReadable: "Immunization Records",
} as const;

/** Same fallback pattern as lib/notify.ts and lib/email-templates.ts. */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://enroll.rootedschool.org";

/**
 * Matches app/api/cron/event-followups/route.ts's local whenText() exactly,
 * so event-related samples render on this page the same way they render in
 * the real reminder/follow-up emails and texts.
 */
function whenText(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Matches the en-US deadline formatting used inline in lib/notify.ts. */
function deadlineEn(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

/** Matches the es-US deadline formatting used inline in lib/notify.ts. */
function deadlineEs(iso: string): string {
  return new Date(iso).toLocaleDateString("es-US", { weekday: "long", month: "long", day: "numeric" });
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type FunnelStage =
  | "Inquiry & Recruitment"
  | "Application & Review"
  | "Lottery"
  | "Offer & Waitlist"
  | "Registration"
  | "Enrolled & Retention"
  | "Campaign building blocks";

export type MessageChannel = "email" | "sms" | "in_app";

export interface AutomatedMessageEntry {
  key: string;
  label: string;
  funnelStage: FunnelStage;
  /** One accurate, plain-English sentence: what causes this message to send. */
  trigger: string;
  channels: MessageChannel[];
  renderEmail?: () => EmailTemplate;
  renderSms?: () => string;
}

// ─── SMS transcriptions (source: lib/notify.ts unless noted) ───────────────
// Each function below reproduces one inline SMS template string exactly,
// with sample data substituted for the real runtime values.

/** Source: lib/notify.ts notifyLeadWelcome(). */
function smsLeadWelcome(): string {
  const { guardianFirstName, campusName } = SAMPLE;
  return `Rooted Schools: Hi ${guardianFirstName}! Thanks for your interest in ${campusName}. A member of our team will reach out soon. Questions? Just reply.\n¡Gracias por su interés! Nuestro equipo le contactará pronto.`;
}

/** Source: lib/notify.ts notifyLeadReengagement(). */
function smsLeadReengagement(): string {
  const { guardianFirstName, campusName } = SAMPLE;
  return `Rooted Schools: Hi ${guardianFirstName} — still thinking about ${campusName}? We'd love to help with any questions. Just reply, or apply here: ${APP_URL}/login\n¿Aún considerando ${campusName}? Responda con sus preguntas.`;
}

/** Source: lib/notify.ts notifyFamilyApplicationWaitlisted(). */
function smsLotteryWaitlisted(): string {
  const { studentFirstName, campusName, position } = SAMPLE;
  return `Rooted Schools: The lottery for ${campusName} has been held. ${studentFirstName ?? "Your student"} is ${
    position != null ? `#${position} on the waitlist` : "on the waitlist"
  } — we'll reach out if a seat opens. See your dashboard: ${APP_URL}/family/dashboard\nEl sorteo para ${campusName} se realizó. ${
    studentFirstName ?? "Su estudiante"
  } está en la lista de espera — le avisaremos si se abre un cupo.`;
}

/** Source: lib/notify.ts notifyFamilyOfOffer(). Same body for a direct offer or a waitlist promotion. */
function smsOfferExtended(): string {
  const { studentFirstName, campusName, offerDeadlineIso } = SAMPLE;
  const deadline = deadlineEn(offerDeadlineIso);
  const deadlineEsStr = deadlineEs(offerDeadlineIso);
  return `Rooted Schools: A seat has been offered${studentFirstName ? ` for ${studentFirstName}` : ""} at ${campusName}! Respond by ${deadline}: ${APP_URL}/family/offers\nSe ofreció un cupo. Responda antes del ${deadlineEsStr}.`;
}

/** Source: lib/notify.ts notifyFamilyOfferExpiringSoon(). */
function smsOfferExpiringSoon(): string {
  const { campusName, offerDeadlineIso } = SAMPLE;
  const deadline = deadlineEn(offerDeadlineIso);
  const deadlineEsStr = deadlineEs(offerDeadlineIso);
  return `Rooted Schools: Your seat offer at ${campusName} expires ${deadline}. Respond now to keep your spot: ${APP_URL}/family/offers\nSu oferta de cupo vence el ${deadlineEsStr}. Responda ahora.`;
}

/** Source: lib/notify.ts notifyFamilyDocumentRejected(). */
function smsDocumentRejected(): string {
  const { documentTypeReadable } = SAMPLE;
  return `Rooted Schools: We need a new copy of your ${documentTypeReadable}. Upload here: ${APP_URL}/family/documents\nNecesitamos una nueva copia de su documento. Súbala en el enlace.`;
}

/**
 * Transcription of lib/nudge-copy.ts's registrationNudgeSms(), kept as a
 * separate copy (not an import) so every SMS entry in this registry follows
 * the same pattern, and so lib/__tests__/automated-messages.test.ts can
 * mechanically catch drift between this copy and the real function — the
 * one SMS body in this file we can actually verify by machine, since it's
 * the one already exported as a pure function elsewhere.
 */
function smsRegistrationNudge(): string {
  const { studentFirstName, campusName, count } = SAMPLE;
  return `Rooted Schools: ${count} registration item${count === 1 ? "" : "s"} still needed for ${
    studentFirstName ?? "your student"
  } at ${campusName}. Finish here: ${APP_URL}/family/registration\nAún faltan pasos de inscripción. Complételos en el enlace.`;
}

/** Source: lib/notify.ts notifyFamilyKeepTheSeat(). */
function smsKeepTheSeat(): string {
  const { studentFirstName, campusName } = SAMPLE;
  return `Rooted Schools: ${studentFirstName ?? "Your student"}'s seat at ${campusName} is all set! Watch for orientation details this summer.\n¡El cupo de ${
    studentFirstName ?? "su estudiante"
  } en ${campusName} está listo! Esté atento(a) a los detalles de orientación este verano.`;
}

/** Source: lib/notify.ts notifyFamilyRegistrationComplete(). */
function smsRegistrationComplete(): string {
  const { studentFirstName, campusName } = SAMPLE;
  return `Rooted Schools: ${studentFirstName ?? "Your student"} is officially enrolled at ${campusName}! Welcome to the family.\n¡${studentFirstName ?? "Su estudiante"} está oficialmente inscrito/a en ${campusName}! Bienvenidos.`;
}

/** Source: lib/notify.ts notifyFamilyReenrollmentPulse(). */
function smsReenrollmentPulse(): string {
  const { studentFirstName, nextSchoolYearName } = SAMPLE;
  return `Rooted Schools: Is ${studentFirstName ?? "your student"} coming back${
    nextSchoolYearName ? ` for ${nextSchoolYearName}` : " next year"
  }? One tap to let us know: ${APP_URL}/family/reenrollment\n¿${
    studentFirstName ?? "Su estudiante"
  } regresará${nextSchoolYearName ? ` para ${nextSchoolYearName}` : " el próximo año"}? Responda con un toque: ${APP_URL}/family/reenrollment`;
}

/**
 * Source: app/api/cron/event-followups/route.ts runReminders(), "day_before"
 * urgency branch — the ~24h-before reminder. The route also sends
 * "starting_soon" (~2h before) and a neutral "coming_soon" fallback with
 * slightly different wording; this preview shows the most common case.
 */
function smsEventReminder(): string {
  const { campusName, eventTitle, eventStartsAtIso, eventLocation } = SAMPLE;
  const when = whenText(eventStartsAtIso);
  return `Rooted Schools: Reminder — ${eventTitle} at ${campusName} is tomorrow, ${when} at ${eventLocation}. See you there!\nRecordatorio — ${eventTitle} en ${campusName} es mañana. ¡Nos vemos!`;
}

/** Source: app/api/cron/event-followups/route.ts runFollowups(), attended branch. */
function smsEventFollowupAttended(): string {
  const { eventTitle } = SAMPLE;
  return `Rooted Schools: It was great to meet you at ${eventTitle}! Ready to apply? It takes 5 minutes: ${APP_URL}/login\nFue un gusto conocerle. ¿Listo(a) para aplicar? Tome 5 minutos: ${APP_URL}/login`;
}

/** Source: app/api/cron/event-followups/route.ts runFollowups(), no-show branch, "next event exists" case. */
function smsEventFollowupNoShow(): string {
  const { eventTitle, nextEventTitle } = SAMPLE;
  const smsCta = `${APP_URL}/events/sample-event-id`;
  return `Rooted Schools: We missed you at ${eventTitle}! Join us next at ${nextEventTitle}: ${smsCta}\nLe extrañamos. Le esperamos en nuestro próximo evento: ${smsCta}`;
}

// ─── Registry ────────────────────────────────────────────────────────────────

export const AUTOMATED_MESSAGES: AutomatedMessageEntry[] = [
  // ─── Inquiry & Recruitment ──────────────────────────────────────────────
  {
    key: "inquiryWelcome",
    label: "Inquiry welcome",
    funnelStage: "Inquiry & Recruitment",
    trigger: "The moment a new family submits the interest form or is imported from a campus sheet. Once per family, ever.",
    channels: ["email", "sms"],
    renderEmail: () =>
      emailTemplates.inquiryWelcome({ guardianFirstName: SAMPLE.guardianFirstName, campusName: SAMPLE.campusName }),
    renderSms: smsLeadWelcome,
  },
  {
    key: "leadReengagement",
    label: "Lead re-engagement",
    funnelStage: "Inquiry & Recruitment",
    trigger: "One check-in to a family who went quiet, sent by the daily 17:00 UTC automation, once per family.",
    channels: ["email", "sms"],
    renderEmail: () =>
      emailTemplates.leadReengagement({ guardianFirstName: SAMPLE.guardianFirstName, campusName: SAMPLE.campusName }),
    renderSms: smsLeadReengagement,
  },
  {
    key: "eventRsvpConfirmation",
    label: "Event RSVP confirmation",
    funnelStage: "Inquiry & Recruitment",
    trigger: "Instantly on RSVP.",
    channels: ["email"],
    renderEmail: () =>
      emailTemplates.eventRsvpConfirmation({
        guardianFirstName: SAMPLE.guardianFirstName,
        campusName: SAMPLE.campusName,
        eventTitle: SAMPLE.eventTitle,
        whenText: whenText(SAMPLE.eventStartsAtIso),
        location: SAMPLE.eventLocation,
      }),
  },
  {
    key: "eventReminder",
    label: "Event reminder",
    funnelStage: "Inquiry & Recruitment",
    trigger: "About a day before and about two hours before an event (hourly automation).",
    channels: ["email", "sms"],
    renderEmail: () =>
      emailTemplates.eventReminder({
        guardianFirstName: SAMPLE.guardianFirstName,
        campusName: SAMPLE.campusName,
        eventTitle: SAMPLE.eventTitle,
        whenText: whenText(SAMPLE.eventStartsAtIso),
        location: SAMPLE.eventLocation,
        urgency: "day_before",
      }),
    renderSms: smsEventReminder,
  },
  {
    key: "eventFollowupAttended",
    label: "Event follow-up — attended",
    funnelStage: "Inquiry & Recruitment",
    trigger: "The morning after an event, sent to guardians who checked in.",
    channels: ["email", "sms"],
    renderEmail: () =>
      emailTemplates.eventFollowupAttended({
        guardianFirstName: SAMPLE.guardianFirstName,
        campusName: SAMPLE.campusName,
        eventTitle: SAMPLE.eventTitle,
      }),
    renderSms: smsEventFollowupAttended,
  },
  {
    key: "eventFollowupNoShow",
    label: "Event follow-up — no-show",
    funnelStage: "Inquiry & Recruitment",
    trigger: "The morning after an event, sent to guardians who RSVP'd but never checked in.",
    channels: ["email", "sms"],
    renderEmail: () =>
      emailTemplates.eventFollowupNoShow({
        guardianFirstName: SAMPLE.guardianFirstName,
        campusName: SAMPLE.campusName,
        eventTitle: SAMPLE.eventTitle,
        nextEvent: {
          title: SAMPLE.nextEventTitle,
          whenText: whenText(SAMPLE.nextEventStartsAtIso),
          url: `${APP_URL}/events/sample-event-id`,
        },
      }),
    renderSms: smsEventFollowupNoShow,
  },

  // ─── Application & Review ────────────────────────────────────────────────
  {
    key: "applicationReceived",
    label: "Application received",
    funnelStage: "Application & Review",
    trigger: "Instantly when a family submits an application.",
    channels: ["email", "in_app"],
    renderEmail: () =>
      emailTemplates.applicationReceived({ studentFirstName: SAMPLE.studentFirstName, campusName: SAMPLE.campusName }),
  },
  {
    key: "documentRejected",
    label: "Document rejected",
    funnelStage: "Application & Review",
    trigger: "The moment staff reject an uploaded document; the family is asked to re-upload it.",
    channels: ["sms", "in_app"],
    renderSms: smsDocumentRejected,
  },

  // ─── Lottery ──────────────────────────────────────────────────────────────
  {
    key: "lotteryResultWaitlisted",
    label: "Lottery result — waitlisted",
    funnelStage: "Lottery",
    trigger: "When lottery results place a family on the waitlist.",
    channels: ["email", "sms", "in_app"],
    renderEmail: () =>
      emailTemplates.lotteryResultWaitlisted({
        studentFirstName: SAMPLE.studentFirstName,
        campusName: SAMPLE.campusName,
        position: SAMPLE.position,
      }),
    renderSms: smsLotteryWaitlisted,
  },

  // ─── Offer & Waitlist ───────────────────────────────────────────────────
  {
    key: "waitlistPromoted",
    label: "Waitlist promoted to offer",
    funnelStage: "Offer & Waitlist",
    trigger: "The moment a seat is offered (lottery, manual, or waitlist promotion).",
    channels: ["email", "sms", "in_app"],
    renderEmail: () =>
      emailTemplates.waitlistPromoted({ studentFirstName: SAMPLE.studentFirstName, campusName: SAMPLE.campusName }),
    renderSms: smsOfferExtended,
  },
  {
    key: "offerExtended",
    label: "Offer extended",
    funnelStage: "Offer & Waitlist",
    trigger: "The moment a seat is offered (lottery, manual, or waitlist promotion).",
    channels: ["email", "sms", "in_app"],
    renderEmail: () =>
      emailTemplates.offerExtended({
        studentFirstName: SAMPLE.studentFirstName,
        campusName: SAMPLE.campusName,
        expiresAt: SAMPLE.offerDeadlineIso,
      }),
    renderSms: smsOfferExtended,
  },
  {
    key: "offerExpiringSoon",
    label: "Offer expiring soon",
    funnelStage: "Offer & Waitlist",
    trigger: "Daily 15:00 UTC automation, when an offer deadline is approaching; also staff ‘Text all’ on Today.",
    channels: ["email", "sms", "in_app"],
    renderEmail: () =>
      emailTemplates.offerExpiringSoon({
        studentFirstName: SAMPLE.studentFirstName,
        campusName: SAMPLE.campusName,
        expiresAt: SAMPLE.offerDeadlineIso,
      }),
    renderSms: smsOfferExpiringSoon,
  },
  {
    key: "offerAccepted",
    label: "Offer accepted → registration ready",
    funnelStage: "Offer & Waitlist",
    trigger: "Instantly when a family accepts a seat.",
    channels: ["email", "in_app"],
    renderEmail: () =>
      emailTemplates.offerAccepted({ studentFirstName: SAMPLE.studentFirstName, campusName: SAMPLE.campusName }),
  },
  {
    key: "waitlistPositionImproved",
    label: "Waitlist position improved",
    funnelStage: "Offer & Waitlist",
    trigger: "When another family leaves the waitlist, families who moved up hear their new position (email sent to the top 3 only; everyone affected gets the in-app notice).",
    channels: ["email", "in_app"],
    renderEmail: () =>
      emailTemplates.waitlistPositionImproved({
        studentFirstName: SAMPLE.studentFirstName,
        campusName: SAMPLE.campusName,
        position: SAMPLE.position,
      }),
  },

  // ─── Registration ───────────────────────────────────────────────────────
  {
    key: "registrationNudge",
    label: "Registration nudge",
    funnelStage: "Registration",
    trigger: "Daily 16:00 UTC automation for unfinished packets, at most every 4 days per family; also staff Send nudge.",
    channels: ["email", "sms", "in_app"],
    renderEmail: () =>
      emailTemplates.registrationNudge({
        studentFirstName: SAMPLE.studentFirstName,
        campusName: SAMPLE.campusName,
        missingNames: SAMPLE.missingNames,
      }),
    renderSms: smsRegistrationNudge,
  },
  {
    key: "registrationComplete",
    label: "Registration complete",
    funnelStage: "Registration",
    trigger: "The moment staff verify the final registration item.",
    channels: ["email", "sms", "in_app"],
    renderEmail: () =>
      emailTemplates.registrationComplete({ studentFirstName: SAMPLE.studentFirstName, campusName: SAMPLE.campusName }),
    renderSms: smsRegistrationComplete,
  },
  {
    key: "keepTheSeat",
    label: "Keep the seat",
    funnelStage: "Registration",
    trigger: "Once, 2+ days after registration completes, before the school year starts (daily 14:30 UTC).",
    channels: ["email", "sms", "in_app"],
    renderEmail: () =>
      emailTemplates.keepTheSeat({
        studentFirstName: SAMPLE.studentFirstName,
        campusName: SAMPLE.campusName,
        startDate: SAMPLE.schoolYearStartIso,
      }),
    renderSms: smsKeepTheSeat,
  },

  // ─── Enrolled & Retention ───────────────────────────────────────────────
  {
    key: "reenrollmentPulse",
    label: "Re-enrollment pulse",
    funnelStage: "Enrolled & Retention",
    trigger: "Only when staff press Send pulse; at most every 7 days per family.",
    channels: ["email", "sms", "in_app"],
    renderEmail: () =>
      emailTemplates.reenrollmentPulse({
        studentFirstName: SAMPLE.studentFirstName,
        campusName: SAMPLE.campusName,
        nextSchoolYearName: SAMPLE.nextSchoolYearName,
      }),
    renderSms: smsReenrollmentPulse,
  },

  // ─── Campaign building blocks ───────────────────────────────────────────
  // Sent only as part of a staff-created batch campaign or nurture journey
  // step (app/staff/recruitment "Email Families", app/api/cron/send-campaigns,
  // app/api/cron/run-journeys) — never automatically to an individual family
  // the way every entry above is. Staff pick a building block and fill in the
  // blanks; renderCampaignEmail is the one function every campaign send goes
  // through, so these four samples cover the full CampaignTemplateKey union.
  {
    key: "campaignReintroduction",
    label: "Campaign block: Reintroduction / Apply Now",
    funnelStage: "Campaign building blocks",
    trigger: "Sent only as part of a staff-created campaign or nurture journey step.",
    channels: ["email"],
    renderEmail: () => emailTemplates.renderCampaignEmail("reintroduction", {}, SAMPLE.campusName),
  },
  {
    key: "campaignEventInvite",
    label: "Campaign block: Event Invitation",
    funnelStage: "Campaign building blocks",
    trigger: "Sent only as part of a staff-created campaign or nurture journey step.",
    channels: ["email"],
    renderEmail: () =>
      emailTemplates.renderCampaignEmail(
        "event_invite",
        {
          eventName: SAMPLE.eventTitle,
          eventDate: "Thursday, September 10, 6:00 PM",
          eventLocation: SAMPLE.eventLocation,
        },
        SAMPLE.campusName
      ),
  },
  {
    key: "campaignDeadline",
    label: "Campaign block: Deadline Reminder",
    funnelStage: "Campaign building blocks",
    trigger: "Sent only as part of a staff-created campaign or nurture journey step.",
    channels: ["email"],
    renderEmail: () =>
      emailTemplates.renderCampaignEmail("deadline", { deadline: "September 15, 2026" }, SAMPLE.campusName),
  },
  {
    key: "campaignCustom",
    label: "Campaign block: Custom Message",
    funnelStage: "Campaign building blocks",
    trigger: "Sent only as part of a staff-created campaign or nurture journey step.",
    channels: ["email"],
    renderEmail: () =>
      emailTemplates.renderCampaignEmail(
        "custom",
        {
          subject: "A quick note about your application",
          bodyEn: "We wanted to check in and see if you have any questions about applying.",
          bodyEs: "Queríamos consultar si tiene alguna pregunta sobre la solicitud.",
          ctaLabel: "Learn more",
          ctaUrl: `${APP_URL}/login`,
        },
        SAMPLE.campusName
      ),
  },
];

/** Grouping order for the staff preview page. */
export const FUNNEL_STAGE_ORDER: FunnelStage[] = [
  "Inquiry & Recruitment",
  "Application & Review",
  "Lottery",
  "Offer & Waitlist",
  "Registration",
  "Enrolled & Retention",
  "Campaign building blocks",
];

/**
 * Exposed for the unit test — lets it compare this file's own transcription
 * of registrationNudgeSms against the real lib/nudge-copy.ts export without
 * duplicating the sample-data setup.
 */
export const _internal = {
  smsRegistrationNudge,
  realRegistrationNudgeSms: () =>
    realRegistrationNudgeSms({
      studentFirstName: SAMPLE.studentFirstName,
      campusName: SAMPLE.campusName,
      count: SAMPLE.count,
    }),
};
