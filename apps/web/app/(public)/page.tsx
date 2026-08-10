import { createServiceClient } from "@rooted-ems/database/service";
import { LandingClient, type LandingSchool } from "./landing-client";

export const revalidate = 300; // revalidate every 5 minutes

export const metadata = {
  title: "rootedschools | Enroll Today",
};

async function getPublicEnrollmentWindows() {
  const supabase = createServiceClient();
  const now = new Date();
  const nowIso = now.toISOString();

  const { data, error } = await supabase
    .from("enrollment_window")
    .select(`id, name, open_date, close_date, status, campus:campus_id (id, name)`)
    .gte("close_date", nowIso)
    .eq("status", "open")
    .order("open_date", { ascending: true });

  if (error) {
    console.error("[homepage/getEnrollmentWindows]", error.message);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => {
    const campus = row.campus as Record<string, string> | null;
    const openDate = new Date(row.open_date as string);
    const closeDate = new Date(row.close_date as string);
    const isOpen = now >= openDate && now <= closeDate;

    let daysRemaining: number | null = null;
    if (isOpen) {
      daysRemaining = Math.ceil(
        (closeDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    return {
      campus_name: campus?.name ?? "",
      campus_id: campus?.id ?? "",
      is_open: isOpen,
      // Raw ISO date — the client formats it with Intl keyed to the locale.
      close_date: row.close_date as string,
      days_remaining: daysRemaining,
    };
  });
}

/**
 * For campuses without a currently-open window, closed-campus cards should
 * never be a dead end during the pre-season months. Fetch each campus's next
 * upcoming enrollment window (any status, including draft — pre-season
 * windows are drafted well before staff flips them to open) so the card can
 * advertise a real date instead of a bare "Closed" badge.
 */
async function getUpcomingEnrollmentWindows() {
  const supabase = createServiceClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("enrollment_window")
    .select(`id, name, open_date, status, campus:campus_id (id, name)`)
    .gt("open_date", nowIso)
    .order("open_date", { ascending: true });

  if (error) {
    console.error("[homepage/getUpcomingEnrollmentWindows]", error.message);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => {
    const campus = row.campus as Record<string, string> | null;
    return {
      campus_name: campus?.name ?? "",
      campus_id: campus?.id ?? "",
      // Raw ISO date — the client formats it with Intl keyed to the locale.
      open_date: row.open_date as string,
    };
  });
}

export default async function HomePage() {
  // Fetch enrollment windows from DB (service client bypasses RLS for public page)
  const [windows, upcomingWindows] = await Promise.all([
    getPublicEnrollmentWindows(),
    getUpcomingEnrollmentWindows(),
  ]);

  // Static school data with match keys to link to DB enrollment windows.
  // Names are proper nouns and intentionally not translated.
  const schoolDefs = [
    {
      name: "rootedschools vancouver",
      location: "Vancouver, WA",
      gradesRange: "9-12",
      logo: "/logos/rooted-vancouver.png",
      matchKey: "vancouver",
    },
    {
      name: "C.R. Neal Academy",
      location: "Columbia, SC",
      gradesRange: "6-12",
      logo: "/logos/cr-neal-academy.png",
      matchKey: "neal",
    },
    {
      name: "rootedschools cleveland",
      location: "Cleveland, OH",
      gradesRange: "6-12",
      logo: "/logos/rooted-cleveland.png",
      matchKey: "cleveland",
    },
  ];

  // Match each school to its enrollment window status. Windows are ordered
  // ascending by open_date, so the first match per campus is its earliest
  // upcoming window.
  const schools: LandingSchool[] = schoolDefs.map((school) => {
    const match = windows.find((w) =>
      w.campus_name.toLowerCase().includes(school.matchKey)
    );
    const upcomingMatch = match?.is_open
      ? undefined
      : upcomingWindows.find((w) =>
          w.campus_name.toLowerCase().includes(school.matchKey)
        );
    return {
      ...school,
      isOpen: match?.is_open ?? false,
      closeDate: match?.close_date ?? null,
      daysRemaining: match?.days_remaining ?? null,
      campusId: match?.campus_id ?? upcomingMatch?.campus_id ?? null,
      upcomingOpenDate: upcomingMatch?.open_date ?? null,
    };
  });

  return <LandingClient schools={schools} />;
}
