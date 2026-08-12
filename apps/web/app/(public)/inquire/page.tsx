import { createServiceRoleClient } from "@rooted-ems/database/server";
import { LocaleProvider } from "@/lib/i18n/locale-context";
import { getLocaleCookie } from "@/lib/i18n/get-locale";
import { InquiryForm } from "./inquiry-form";

export const metadata = {
  title: "Get More Info — Rooted Schools",
};

// Reads the locale cookie, so this page renders per-request.
export const dynamic = "force-dynamic";

export default async function InquirePage({
  searchParams,
}: {
  searchParams: { src?: string; campus?: string };
}) {
  // Provider wraps the form so the language toggle actually re-renders it —
  // without it, useLocale() falls back to the default context and the page
  // is stuck in English (the landing and login pages follow this same pattern).
  const initialLocale = await getLocaleCookie();

  // Service role: campus rows are RLS-visible to authenticated users only,
  // and this page is public. Read-only, names and ids only.
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("campus")
    .select("id, name, short_code, city, state")
    .order("name");

  const campuses = (data ?? []).map((c: Record<string, string>) => ({
    id: c.id,
    name: c.name,
    location: [c.city, c.state].filter(Boolean).join(", "),
  }));

  // LG-1 Capture Kit: ?src= tags where this lead came from (a school-website
  // page, a flyer's QR, a specific campaign). ?campus= optionally preselects.
  const sourceTag = searchParams?.src?.slice(0, 60);
  const campusParam = searchParams?.campus;
  const preselected = (data ?? []).find(
    (c: Record<string, string>) =>
      c.id === campusParam || c.short_code?.toLowerCase() === campusParam?.toLowerCase()
  ) as Record<string, string> | undefined;

  return (
    <LocaleProvider initialLocale={initialLocale}>
      <InquiryForm
        campuses={campuses}
        sourceTag={sourceTag}
        preselectedCampusId={preselected?.id}
      />
    </LocaleProvider>
  );
}
