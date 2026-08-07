export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { LocaleProvider } from "@/lib/i18n/locale-context";
import { getLocale } from "@/lib/i18n/get-locale";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { getPublicEvent } from "@/lib/queries";
import { EventTypeLabel, formatEventWhen } from "../event-format";
import { RsvpForm } from "./rsvp-form";

export const metadata = { title: "Register — Rooted Schools" };

export default async function PublicEventPage({ params }: { params: { id: string } }) {
  const [locale, event] = await Promise.all([getLocale(), getPublicEvent(params.id)]);
  if (!event) notFound();
  const es = locale === "es";

  return (
    <LocaleProvider initialLocale={locale}>
      <div className="min-h-screen bg-gradient-to-b from-rooted-green/5 to-warm-white py-8 px-4">
        <div className="max-w-md mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <Link href="/events" className="text-sm text-rooted-green hover:underline">
              &larr; {es ? "Todos los eventos" : "All events"}
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
    </LocaleProvider>
  );
}
