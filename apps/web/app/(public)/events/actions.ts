"use server";

import { rsvpToEvent } from "@/lib/mutations";
import { checkRateLimit } from "@/lib/rate-limit";
import { tx, type Locale } from "@/lib/i18n/translations";

/** Narrow an untrusted client-supplied language string to a real Locale. */
function resolveLocale(value: string | undefined): Locale {
  return value === "es" ? "es" : "en";
}

export interface RsvpSubmission {
  event_id: string;
  campus_id: string;
  guardian_name: string;
  email: string;
  phone: string;
  party_size: number;
  /** TCPA opt-in checkbox on the RSVP form. */
  sms_consent?: boolean;
  website: string; // honeypot
  /**
   * The family's currently selected UI language. Not persisted anywhere —
   * used only to pick the language of any error string this action
   * returns, so the caller doesn't have to guess it server-side.
   */
  locale: string;
}

export async function submitRsvp(input: RsvpSubmission) {
  const locale = resolveLocale(input.locale);
  if (input.website?.trim()) return { data: null, error: null }; // bot
  // LG-0.4: generous per-IP throttle (a family RSVPing several kids is fine;
  // a script isn't).
  const rl = await checkRateLimit("rsvp", 10, 60);
  if (!rl.allowed) return { data: null, error: tx("common.rateLimitError", locale) };
  return rsvpToEvent({
    event_id: input.event_id,
    campus_id: input.campus_id,
    guardian_name: input.guardian_name?.slice(0, 120) ?? "",
    email: input.email?.slice(0, 200) || undefined,
    phone: input.phone?.slice(0, 30) || undefined,
    party_size: Number(input.party_size) || 1,
    sms_consent: input.sms_consent === true,
  });
}
