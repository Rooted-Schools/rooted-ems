"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { IconCheckCircle } from "@/components/ui/icons";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { useLocale } from "@/lib/i18n/locale-context";
import type { PublicEvent } from "@/lib/queries";
import { EventTypeLabel, formatEventWhen } from "../event-format";
import { submitRsvp } from "../actions";

/**
 * Client-rendered event detail + RSVP page. Moved out of page.tsx (a Server
 * Component) for the same reason as the events list — a Server Component
 * bakes `es ? "X" : "Y"` into the HTML once at request time, so the language
 * toggle silently did nothing for the title/date/campus copy even though the
 * nested RsvpForm (already a client component) reacted correctly.
 */
export function EventDetailClient({ event }: { event: PublicEvent }) {
  const { locale, t } = useLocale();
  const es = locale === "es";

  return (
    <div className="min-h-screen bg-gradient-to-b from-rooted-green/5 to-warm-white py-8 px-4">
      <div className="max-w-md mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <Link href="/events" className="text-sm text-rooted-green hover:underline">
            &larr; {t("events.allEvents")}
          </Link>
          <LanguageToggle />
        </div>

        <div className="rounded-xl border border-stone/20 bg-white p-5">
          <span className="inline-block text-[11px] font-semibold uppercase tracking-wide text-rooted-green bg-rooted-green/10 rounded-full px-2 py-0.5">
            <EventTypeLabel type={event.event_type} es={es} />
          </span>
          <h1 className="text-xl font-bold text-ink mt-2">{event.title}</h1>
          <p className="text-sm text-ink/80 mt-1">{formatEventWhen(event.starts_at, event.ends_at, es)}</p>
          <p className="text-xs text-stone-text mt-0.5">
            {event.campus_name}{event.location ? ` · ${event.location}` : ""}
          </p>
          {event.description && (
            <p className="text-sm text-ink/70 mt-3 whitespace-pre-wrap">{event.description}</p>
          )}
        </div>

        <RsvpForm eventId={event.id} campusId={event.campus_id} isFull={event.is_full} />
      </div>
    </div>
  );
}

export function RsvpForm({ eventId, campusId, isFull }: { eventId: string; campusId: string; isFull: boolean }) {
  const { locale, t } = useLocale();
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // sms_consent defaults to false — TCPA opt-in has to be an affirmative act.
  const [form, setForm] = useState({ guardian_name: "", email: "", phone: "", party_size: "2", sms_consent: false, website: "" });
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));

  if (isFull) {
    return (
      <div className="rounded-xl border border-stone/20 bg-white p-5 text-center">
        <p className="text-sm text-ink/70">
          {t("events.eventFull")}{" "}
          <Link href="/inquire" className="text-rooted-green hover:underline">
            {t("events.askNextDate")}
          </Link>.
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="rounded-xl border border-rooted-green/30 bg-rooted-green/5 p-6 text-center space-y-2">
        <div className="flex justify-center text-rooted-green">
          <IconCheckCircle size={32} />
        </div>
        <p className="font-semibold text-ink">{t("events.registered")}</p>
        <p className="text-sm text-ink/70">{t("events.confirmationCheck")}</p>
      </div>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.guardian_name.trim() || (!form.email.trim() && !form.phone.trim())) {
      setError(t("events.rsvpValidation"));
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await submitRsvp({ ...form, event_id: eventId, campus_id: campusId, party_size: Number(form.party_size) || 1, locale });
      if (result.error) setError(result.error);
      else setDone(true);
    });
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-stone/20 bg-white p-5 space-y-3" noValidate>
      <p className="text-sm font-semibold text-ink">{t("events.saveSpot")}</p>
      <div className="absolute -left-[9999px]" aria-hidden="true">
        <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set({ website: e.target.value })} />
      </div>
      <div>
        <label htmlFor="rsvp-name" className="block text-sm font-medium text-ink/70 mb-1">
          {t("events.yourName")} <span className="text-error">*</span>
        </label>
        <Input id="rsvp-name" value={form.guardian_name} onChange={(e) => set({ guardian_name: e.target.value })} autoComplete="name" />
      </div>
      <div>
        <label htmlFor="rsvp-email" className="block text-sm font-medium text-ink/70 mb-1">{t("events.email")}</label>
        <Input id="rsvp-email" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} autoComplete="email" inputMode="email" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="rsvp-phone" className="block text-sm font-medium text-ink/70 mb-1">{t("events.phone")}</label>
          <Input id="rsvp-phone" type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} autoComplete="tel" inputMode="tel" />
        </div>
        <div>
          <label htmlFor="rsvp-party" className="block text-sm font-medium text-ink/70 mb-1">{t("events.howManyComing")}</label>
          <Select id="rsvp-party" value={form.party_size} onChange={(e) => set({ party_size: e.target.value })}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={String(n)}>{n}{n === 6 ? "+" : ""}</option>
            ))}
          </Select>
        </div>
      </div>
      <label htmlFor="rsvp-sms-consent" className="flex items-start gap-2 text-sm text-ink/70">
        <input
          id="rsvp-sms-consent"
          type="checkbox"
          checked={form.sms_consent}
          onChange={(e) => set({ sms_consent: e.target.checked })}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-stone/40 text-rooted-green focus:ring-rooted-green"
        />
        <span>{t("events.smsConsent")}</span>
      </label>
      {error && <p className="text-sm text-error bg-error/10 border border-error/30 rounded-[6px] px-3 py-2">{error}</p>}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? t("events.registering") : t("events.register")}
      </Button>
    </form>
  );
}
