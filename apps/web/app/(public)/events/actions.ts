"use server";

import { rsvpToEvent } from "@/lib/mutations";

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
  return rsvpToEvent({
    event_id: input.event_id,
    campus_id: input.campus_id,
    guardian_name: input.guardian_name?.slice(0, 120) ?? "",
    email: input.email?.slice(0, 200) || undefined,
    phone: input.phone?.slice(0, 30) || undefined,
    party_size: Number(input.party_size) || 1,
  });
}
