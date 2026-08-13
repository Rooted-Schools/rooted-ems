"use client";

import Link from "next/link";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { useLocale } from "@/lib/i18n/locale-context";
import { tx, type TranslationKey } from "@/lib/i18n/translations";
import type { PublicEvent } from "@/lib/queries";

const KNOWN_EVENT_TYPES = new Set(["info_session", "open_house", "tour"]);

export function EventTypeLabel({ type, es }: { type: string; es: boolean }) {
  const key = (KNOWN_EVENT_TYPES.has(type) ? `events.type.${type}` : "events.type.other") as TranslationKey;
  return <>{tx(key, es ? "es" : "en")}</>;
}

export function formatEventWhen(startsAt: string, endsAt: string | null, es: boolean): string {
  const locale = es ? "es-US" : "en-US";
  const start = new Date(startsAt);
  const date = start.toLocaleDateString(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const startTime = start.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  const endTime = endsAt
    ? new Date(endsAt).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })
    : null;
  return `${date} · ${startTime}${endTime ? `–${endTime}` : ""}`;
}

/**
 * Client-rendered events list. Moved out of page.tsx (a Server Component)
 * because the language toggle only mutates client-side React context — a
 * Server Component bakes `es ? "X" : "Y"` into the HTML once at request
 * time, so toggling the language did nothing here even though it worked
 * correctly inside the nested (already-client) RsvpForm. Reading useLocale()
 * here makes every string on this page reactive to the toggle.
 */
export function EventsListClient({ events }: { events: PublicEvent[] }) {
  const { locale, t } = useLocale();
  const es = locale === "es";

  return (
    <div className="min-h-screen bg-gradient-to-b from-rooted-green/5 to-warm-white py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm text-rooted-green hover:underline">
            &larr; {t("events.backHome")}
          </Link>
          <LanguageToggle />
        </div>

        <div>
          <h1 className="text-2xl font-bold text-ink">{t("events.heading")}</h1>
          <p className="text-sm text-stone-text mt-1">{t("events.subtitle")}</p>
        </div>

        {events.length === 0 ? (
          <div className="rounded-xl border border-stone/20 bg-white px-4 py-10 text-center">
            <p className="text-stone-text text-sm">{t("events.noneScheduled")}</p>
            <Link href="/inquire" className="text-sm text-rooted-green hover:underline mt-2 inline-block">
              {t("events.requestInfo")} &rarr;
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((e) => (
              <div key={e.id} className="rounded-xl border border-stone/20 bg-white p-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <span className="inline-block text-[11px] font-semibold uppercase tracking-wide text-rooted-green bg-rooted-green/10 rounded-full px-2 py-0.5">
                    <EventTypeLabel type={e.event_type} es={es} />
                  </span>
                  <h2 className="text-base font-semibold text-ink mt-1.5">{e.title}</h2>
                  <p className="text-sm text-ink/70">{formatEventWhen(e.starts_at, e.ends_at, es)}</p>
                  <p className="text-xs text-stone-text mt-0.5">
                    {e.campus_name}{e.location ? ` · ${e.location}` : ""}
                  </p>
                </div>
                <div className="shrink-0 self-center">
                  {e.is_full ? (
                    <span className="text-xs text-stone-text">{t("events.full")}</span>
                  ) : (
                    <Link
                      href={`/events/${e.id}`}
                      className="inline-flex min-h-[44px] items-center justify-center px-4 rounded-[6px] text-sm font-semibold text-white bg-rooted-green hover:bg-deep-green transition-colors"
                    >
                      {t("events.register")}
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
