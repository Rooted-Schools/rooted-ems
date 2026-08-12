export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@rooted-ems/database/server";
import { LocaleProvider } from "@/lib/i18n/locale-context";
import { getLocaleCookie } from "@/lib/i18n/get-locale";
import { InquiryForm } from "../../inquire/inquiry-form";

export const metadata = { title: "You're invited — Rooted Schools" };

export default async function ReferralPage({ params }: { params: { code: string } }) {
  const supabase = createServiceRoleClient();

  // Resolve the referring family from their code.
  const { data: referrer } = await supabase
    .from("lead")
    .select("id, first_name, campus_id")
    .eq("referral_code", params.code.toUpperCase())
    .single();

  // Unknown code → fall back to the normal inquiry form, no attribution.
  if (!referrer) redirect("/inquire");

  const [locale, { data: campusRows }] = await Promise.all([
    getLocaleCookie(),
    supabase.from("campus").select("id, name, city, state").order("name"),
  ]);

  const campuses = (campusRows ?? []).map((c: Record<string, string>) => ({
    id: c.id,
    name: c.name,
    location: [c.city, c.state].filter(Boolean).join(", "),
  }));

  return (
    <LocaleProvider initialLocale={locale}>
      <div className="min-h-screen bg-gradient-to-b from-rooted-green/5 to-warm-white py-8 px-4">
        <div className="max-w-md mx-auto">
          <InquiryForm
            campuses={campuses}
            referrerName={referrer.first_name as string}
            referredByLeadId={referrer.id as string}
            lockedCampusId={referrer.campus_id as string}
          />
        </div>
      </div>
    </LocaleProvider>
  );
}
