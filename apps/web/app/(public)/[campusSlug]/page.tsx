import { notFound } from "next/navigation";
import { createServiceClient } from "@rooted-ems/database/service";
import { getCampusIdentityBySlug } from "@/lib/campus-identity";
import { CampusLandingClient, type CampusWindowState } from "./campus-landing-client";

export const revalidate = 300; // revalidate every 5 minutes — same cadence as the network landing page

interface CampusRow {
  id: string;
  name: string;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
}

async function getCampusRow(shortCode: string): Promise<CampusRow | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("campus")
    .select("id, name, address_line1, city, state, zip, phone, email")
    .eq("short_code", shortCode)
    .single();

  if (error || !data) {
    if (error) console.error("[campusSlug/getCampusRow]", error.message);
    return null;
  }
  return data as CampusRow;
}

/**
 * This campus's real enrollment window state — the exact same honest logic
 * as the network landing page's cards (app/(public)/page.tsx), just scoped
 * to one campus_id instead of a name-substring match, since here we already
 * have the real campus id.
 */
async function getCampusWindowState(campusId: string): Promise<CampusWindowState> {
  const supabase = createServiceClient();
  const now = new Date();
  const nowIso = now.toISOString();

  const [openResult, upcomingResult] = await Promise.all([
    supabase
      .from("enrollment_window")
      .select("close_date, open_date")
      .eq("campus_id", campusId)
      .eq("status", "open")
      .gte("close_date", nowIso)
      .order("open_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("enrollment_window")
      .select("open_date")
      .eq("campus_id", campusId)
      .gt("open_date", nowIso)
      .order("open_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (openResult.error) {
    console.error("[campusSlug/getCampusWindowState] open", openResult.error.message);
  }
  if (upcomingResult.error) {
    console.error("[campusSlug/getCampusWindowState] upcoming", upcomingResult.error.message);
  }

  const openRow = openResult.data as { close_date: string; open_date: string } | null;
  const isOpen = !!openRow && now >= new Date(openRow.open_date) && now <= new Date(openRow.close_date);

  let daysRemaining: number | null = null;
  if (isOpen && openRow) {
    daysRemaining = Math.ceil(
      (new Date(openRow.close_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  const upcomingRow = upcomingResult.data as { open_date: string } | null;

  return {
    isOpen,
    closeDate: isOpen && openRow ? openRow.close_date : null,
    daysRemaining,
    // An open window's own open_date already passed, so it can't also be
    // "upcoming" — only surface upcomingOpenDate when not currently open.
    upcomingOpenDate: !isOpen ? (upcomingRow?.open_date ?? null) : null,
  };
}

export async function generateMetadata({ params }: { params: { campusSlug: string } }) {
  const identity = getCampusIdentityBySlug(params.campusSlug);
  if (!identity) return { title: "Enroll Today | rootedschools" };
  return { title: `${identity.displayName} | Enroll Today` };
}

export default async function CampusLandingPage({
  params,
}: {
  params: { campusSlug: string };
}) {
  const identity = getCampusIdentityBySlug(params.campusSlug);
  if (!identity) notFound();

  const campus = await getCampusRow(identity.shortCode);
  if (!campus) notFound();

  const windowState = await getCampusWindowState(campus.id);

  return (
    <CampusLandingClient
      identity={identity}
      campus={{
        id: campus.id,
        name: campus.name,
        addressLine1: campus.address_line1,
        city: campus.city,
        state: campus.state,
        zip: campus.zip,
        phone: campus.phone,
        email: campus.email,
      }}
      windowState={windowState}
    />
  );
}
