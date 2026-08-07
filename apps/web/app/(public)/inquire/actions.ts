"use server";

import { createLeadFromInquiry } from "@/lib/mutations";
import { updateLeadFromInquiryDetails } from "@/lib/mutations/leads";
import { signInquiryLeadToken, verifyInquiryLeadToken } from "@/lib/inquiry-token";

export interface InquirySubmission {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  sms_consent: boolean;
  preferred_language: string;
  campus_id: string;
  student_first_name: string;
  entry_grade: string;
  pathway_interest: string;
  source: string;
  /** Set by the /refer/[code] landing when a family was referred. */
  referred_by_lead_id?: string;
  /** LG-1: ?src= tag from a school-website page, flyer QR, or campaign. */
  source_tag?: string;
  /** Honeypot — humans never fill this; bots do. */
  website: string;
}

const VALID_SOURCES = new Set(["website", "event", "referral", "qr", "ad", "walk_in", "other"]);

/**
 * Public, unauthenticated entry point for the response engine. Anti-abuse:
 * honeypot field plus server-side field validation; the mutation also
 * soft-dedupes repeat inquiries by email + campus.
 *
 * Progressive capture (Step 1 of 2): this creates the lead immediately with
 * whatever Step 2 fields the family hasn't reached yet left unset — the
 * response engine (welcome text/email, staff routing) fires right here. On
 * success we hand back a per-lead token (see lib/inquiry-token.ts) so the
 * optional Step 2 follow-up can prove it's completing the same lead without
 * this ever becoming a general "update any lead" endpoint.
 */
export async function submitInquiry(input: InquirySubmission) {
  // Bots fill every field; humans never see this one.
  if (input.website?.trim()) {
    // Pretend success — don't teach the bot what failed.
    return { data: { id: "ok", token: "" }, error: null };
  }

  // LG-0.4: generous per-IP throttle — stops floods, never a tabling event's
  // shared wifi (limit is per hour).
  const { checkRateLimit } = await import("@/lib/rate-limit");
  const rl = await checkRateLimit("inquiry", 12, 60);
  if (!rl.allowed) {
    return {
      data: null,
      error:
        "Too many submissions from this connection — please try again in a little while. / Demasiados envíos desde esta conexión — intente de nuevo en un momento.",
    };
  }

  const result = await createLeadFromInquiry({
    campus_id: input.campus_id,
    first_name: input.first_name?.slice(0, 100) ?? "",
    last_name: input.last_name?.slice(0, 100) ?? "",
    email: input.email?.slice(0, 200) || undefined,
    phone: input.phone?.slice(0, 30) || undefined,
    sms_consent: input.sms_consent === true,
    preferred_language: input.preferred_language === "es" ? "es" : "en",
    student_first_name: input.student_first_name?.slice(0, 100) || undefined,
    entry_grade: input.entry_grade?.slice(0, 10) || undefined,
    pathway_interest: input.pathway_interest?.slice(0, 50) || undefined,
    source: input.referred_by_lead_id
      ? "referral"
      : input.source_tag
        ? "qr" // tagged link/QR from a website page or flyer
        : VALID_SOURCES.has(input.source)
          ? input.source
          : "website",
    source_detail: input.referred_by_lead_id
      ? "Family referral link"
      : input.source_tag
        ? `Tagged link: ${input.source_tag.slice(0, 60)}`
        : undefined,
    referred_by_lead_id: input.referred_by_lead_id || undefined,
  });

  if (result.error || !result.data) return { data: null, error: result.error };

  return {
    data: { id: result.data.id, token: signInquiryLeadToken(result.data.id) },
    error: null,
  };
}

export interface InquiryDetailsSubmission {
  lead_id: string;
  /** Per-lead token returned by submitInquiry — proves this browser is the
   *  one that just created lead_id. See lib/inquiry-token.ts. */
  token: string;
  student_first_name: string;
  pathway_interest: string;
  /** The family's own "how did you hear about us?" answer. */
  source: string;
  /** Honeypot — humans never fill this; bots do. */
  website: string;
}

/**
 * Step 2 of 2, optional: "help us get to know you." Only ever updates the
 * exact lead Step 1 just created in this browser — the token is checked
 * before anything else touches the database, so this can never become a
 * way to edit an arbitrary lead by id.
 */
export async function submitInquiryDetails(input: InquiryDetailsSubmission) {
  if (input.website?.trim()) {
    return { data: null, error: null };
  }

  const { checkRateLimit } = await import("@/lib/rate-limit");
  const rl = await checkRateLimit("inquiry-details", 12, 60);
  if (!rl.allowed) {
    return {
      data: null,
      error:
        "Too many submissions from this connection — please try again in a little while. / Demasiados envíos desde esta conexión — intente de nuevo en un momento.",
    };
  }

  if (!verifyInquiryLeadToken(input.lead_id, input.token)) {
    return { data: null, error: "Something went wrong. Please try again." };
  }

  return updateLeadFromInquiryDetails(input.lead_id, {
    student_first_name: input.student_first_name?.slice(0, 100) || undefined,
    pathway_interest: input.pathway_interest?.slice(0, 50) || undefined,
    source: VALID_SOURCES.has(input.source) ? input.source : undefined,
  });
}
