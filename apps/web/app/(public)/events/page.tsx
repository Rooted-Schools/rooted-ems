export const dynamic = "force-dynamic";

import { LocaleProvider } from "@/lib/i18n/locale-context";
import { getLocale } from "@/lib/i18n/get-locale";
import { getUpcomingPublicEvents } from "@/lib/queries";
import { EventsListClient } from "./event-format";

export const metadata = { title: "Upcoming Events — Rooted Schools" };

export default async function PublicEventsPage() {
  const [locale, events] = await Promise.all([getLocale(), getUpcomingPublicEvents()]);

  return (
    <LocaleProvider initialLocale={locale}>
      <EventsListClient events={events} />
    </LocaleProvider>
  );
}
