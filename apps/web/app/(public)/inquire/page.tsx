import { createServiceRoleClient } from "@rooted-ems/database/server";
import { LocaleProvider } from "@/lib/i18n/locale-context";
import { getLocaleCookie } from "@/lib/i18n/get-locale";
import { InquiryForm } from "./inquiry-form";

export const metadata = {
  title: "Get More Info — Rooted Schools",
};

// Reads the locale cookie, so this page renders per-request.
export const dynamic = "force-dynamic";

/**
 * For each campus, the real entering grades for whichever school-year cycle
 * is currently open (or, if none is open, next upcoming) — the same
 * open-or-next-upcoming resolution used on the per-campus landing page
 * (app/(public)/[campusSlug]/page.tsx). Without this, a family could pick a
 * grade the campus isn't actually enrolling and get a confirmation implying
 * follow-up. Never fabricated: a campus with no resolvable school year or no
 * grade_level rows yet is simply absent from the returned map, and the form
 * falls back to the full grade list for it.
 */
async function getCampusGradeOptions(campusIds: string[]): Promise<Record<string, string[]>> {
  if (campusIds.length === 0) return {};
  const supabase = createServiceRoleClient();
  const now = new Date();
  const nowIso = now.toISOString();

  const { data: windowRows, error: windowError } = await supabase
    .from("enrollment_window")
    .select("campus_id, school_year_id, status, open_date, close_date")
    .in("campus_id", campusIds);
  if (windowError) {
    console.error("[inquire/getCampusGradeOptions] windows", windowError.message);
    return {};
  }

  type WindowRow = { campus_id: string; school_year_id: string; status: string; open_date: string; close_date: string };
  const rows = (windowRows ?? []) as WindowRow[];

  const schoolYearByCampus = new Map<string, string>();
  for (const campusId of campusIds) {
    const campusRows = rows.filter((w) => w.campus_id === campusId);
    const open = campusRows.find(
      (w) => w.status === "open" && new Date(w.open_date) <= now && new Date(w.close_date) >= now
    );
    const upcoming = campusRows
      .filter((w) => new Date(w.open_date) > now)
      .sort((a, b) => a.open_date.localeCompare(b.open_date))[0];
    const schoolYearId = open?.school_year_id ?? upcoming?.school_year_id;
    if (schoolYearId) schoolYearByCampus.set(campusId, schoolYearId);
  }

  const schoolYearIds = [...new Set(schoolYearByCampus.values())];
  if (schoolYearIds.length === 0) return {};

  const { data: gradeRows, error: gradeError } = await supabase
    .from("grade_level")
    .select("campus_id, school_year_id, grade")
    .in("campus_id", campusIds)
    .in("school_year_id", schoolYearIds);
  if (gradeError) {
    console.error("[inquire/getCampusGradeOptions] grades", gradeError.message);
    return {};
  }

  type GradeRow = { campus_id: string; school_year_id: string; grade: string };
  const gradesByCampus: Record<string, string[]> = {};
  for (const campusId of campusIds) {
    const schoolYearId = schoolYearByCampus.get(campusId);
    if (!schoolYearId) continue;
    const grades = ((gradeRows ?? []) as GradeRow[])
      .filter((r) => r.campus_id === campusId && r.school_year_id === schoolYearId)
      .map((r) => r.grade);
    if (grades.length > 0) gradesByCampus[campusId] = grades;
  }
  return gradesByCampus;
}

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

  const gradesByCampus = await getCampusGradeOptions(campuses.map((c) => c.id));

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
        gradesByCampus={gradesByCampus}
      />
    </LocaleProvider>
  );
}
