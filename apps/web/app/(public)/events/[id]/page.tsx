export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { LocaleProvider } from "@/lib/i18n/locale-context";
import { getLocale } from "@/lib/i18n/get-locale";
import { getPublicEvent } from "@/lib/queries";
import { EventDetailClient } from "./rsvp-form";

export const metadata = { title: "Register — Rooted Schools" };

export default async function PublicEventPage({ params }: { params: { id: string } }) {
  const [locale, event] = await Promise.all([getLocale(), getPublicEvent(params.id)]);
  if (!event) notFound();

  return (
    <LocaleProvider initialLocale={locale}>
      <EventDetailClient event={event} />
    </LocaleProvider>
  );
}
