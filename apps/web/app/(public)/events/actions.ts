"use server";

import { rsvpToEvent } from "@/lib/mutations";
import { checkRateLimit } from "@/lib/rate-limit";

const RATE_LIMIT_MSG =
  "Too many submissions from this connection — please try again in a little while. / Demasiados envíos desde esta conexión — intente de nuevo en un momento.";

export interface RsvpSubmission {
  event_id: string;
  campus_id: string;
  guardian_name: string;
  email: string;
  phone: string;
  party_size: number;
  website: string; // honeypot
}

export async function submitRsvp(input: RsvpSubmission) {
  if (input.website?.trim()) return { data: null, error: null }; // bot
  // LG-0.4: generous per-IP throttle (a family RSVPing several kids is fine;
  // a script isn't).
  const rl = await checkRateLimit("rsvp", 10, 60);
  if (!rl.allowed) return { data: null, error: RATE_LIMIT_MSG };
  return rsvpToEvent({
    event_id: input.event_id,
    campus_id: input.campus_id,
    guardian_name: input.guardian_name?.slice(0, 120) ?? "",
    email: input.email?.slice(0, 200) || undefined,
    phone: input.phone?.slice(0, 30) || undefined,
    party_size: Number(input.party_size) || 1,
  });
}
