"use server";

/**
 * Global staff search (⌘K palette) — as-you-type lookup across leads,
 * guardians ("Applicants & Families"), and students. Campus-scoped the same
 * way every other staff query is: getAccessibleCampusIds(session), where an
 * empty array means org-wide (system_admin with no scoped campus rows), not
 * "no campuses" — see scopesToCampuses in lib/search-utils.ts.
 *
 * DATA HONESTY: every row returned here is a real, navigable record. A
 * guardian or student whose only applications fall outside the caller's
 * accessible campuses is left out entirely rather than shown with a dead
 * link — see the "no application in an accessible campus" skips below.
 */
import { createServiceRoleClient } from "@rooted-ems/database/server";
import { requireStaffSession, getAccessibleCampusIds } from "@/lib/auth/get-session";
import { getStatusConfig } from "@/lib/application-helpers";
import { phoneDigits10 } from "@/lib/sms";
import {
  likePattern,
  digitsOf,
  MIN_PHONE_SEARCH_DIGITS,
  MIN_SEARCH_QUERY_LENGTH,
  RESULTS_PER_CATEGORY,
  scopesToCampuses,
  capitalizeWord,
} from "@/lib/search-utils";

// A Supabase query builder — typed loosely because the exact generic shape
// differs per table/select and every caller here narrows the row shape
// itself before use, same convention as lib/queries/*.ts in this codebase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQuery = any;

const TEXT_CANDIDATE_LIMIT = RESULTS_PER_CATEGORY * 4;
const PHONE_CANDIDATE_LIMIT = 300;

export interface SearchResultItem {
  id: string;
  title: string;
  /** One context line: campus, stage/status, phone — whichever apply. */
  subtitle: string;
  href: string;
}

export interface GlobalSearchResult {
  leads: SearchResultItem[];
  families: SearchResultItem[];
  students: SearchResultItem[];
}

const EMPTY_RESULT: GlobalSearchResult = { leads: [], families: [], students: [] };

function subtitleOf(parts: Array<string | null | undefined>): string {
  return parts.filter((p): p is string => Boolean(p && p.trim())).join(" · ");
}

interface LeadCandidate {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  stage: string;
  campus: { name?: string } | null;
}

async function searchLeads(
  supabase: AnyQuery,
  term: string,
  digits: string,
  campusIds: string[]
): Promise<SearchResultItem[]> {
  const pattern = likePattern(term);
  const select = "id, first_name, last_name, email, phone, stage, campus:campus_id(name)";

  let textQuery = supabase
    .from("lead")
    .select(select)
    .or(`first_name.ilike."${pattern}",last_name.ilike."${pattern}",email.ilike."${pattern}"`)
    .limit(TEXT_CANDIDATE_LIMIT);
  if (scopesToCampuses(campusIds)) textQuery = textQuery.in("campus_id", campusIds);
  const { data: textRows, error: textError } = await textQuery;
  if (textError) console.error("[searchGlobal] lead text search", textError.message);

  const candidates = new Map<string, LeadCandidate>();
  for (const row of (textRows ?? []) as LeadCandidate[]) candidates.set(row.id, row);

  if (digits.length >= MIN_PHONE_SEARCH_DIGITS) {
    let phoneQuery = supabase
      .from("lead")
      .select(select)
      .not("phone", "is", null)
      .limit(PHONE_CANDIDATE_LIMIT);
    if (scopesToCampuses(campusIds)) phoneQuery = phoneQuery.in("campus_id", campusIds);
    const { data: phoneRows, error: phoneError } = await phoneQuery;
    if (phoneError) console.error("[searchGlobal] lead phone search", phoneError.message);
    for (const row of (phoneRows ?? []) as LeadCandidate[]) {
      const tail = phoneDigits10(row.phone);
      if (tail && tail.includes(digits)) candidates.set(row.id, row);
    }
  }

  return Array.from(candidates.values())
    .slice(0, RESULTS_PER_CATEGORY)
    .map((row) => ({
      id: row.id,
      title: `${row.first_name} ${row.last_name}`.trim(),
      subtitle: subtitleOf([row.campus?.name, capitalizeWord(row.stage), row.phone]),
      href: `/staff/recruitment/${row.id}`,
    }));
}

interface GuardianCandidate {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
}

async function searchFamilies(
  supabase: AnyQuery,
  term: string,
  digits: string,
  campusIds: string[]
): Promise<SearchResultItem[]> {
  const pattern = likePattern(term);
  const select = "id, first_name, last_name, email, phone";

  const { data: textRows, error: textError } = await supabase
    .from("guardian")
    .select(select)
    .or(`first_name.ilike."${pattern}",last_name.ilike."${pattern}",email.ilike."${pattern}"`)
    .limit(TEXT_CANDIDATE_LIMIT);
  if (textError) console.error("[searchGlobal] guardian text search", textError.message);

  const candidates = new Map<string, GuardianCandidate>();
  for (const row of (textRows ?? []) as GuardianCandidate[]) candidates.set(row.id, row);

  if (digits.length >= MIN_PHONE_SEARCH_DIGITS) {
    const { data: phoneRows, error: phoneError } = await supabase
      .from("guardian")
      .select(select)
      .not("phone", "is", null)
      .limit(PHONE_CANDIDATE_LIMIT);
    if (phoneError) console.error("[searchGlobal] guardian phone search", phoneError.message);
    for (const row of (phoneRows ?? []) as GuardianCandidate[]) {
      const tail = phoneDigits10(row.phone);
      if (tail && tail.includes(digits)) candidates.set(row.id, row);
    }
  }

  if (candidates.size === 0) return [];

  // Guardians carry no campus_id of their own — campus scope, and which
  // application to link to, both resolve through their applications. Same
  // shape as getInboundEmails's guardian resolution in lib/queries/staff.ts.
  let appQuery = supabase
    .from("application")
    .select("id, guardian_id, status, created_at, campus:campus_id(name)")
    .in("guardian_id", Array.from(candidates.keys()))
    .order("created_at", { ascending: false });
  if (scopesToCampuses(campusIds)) appQuery = appQuery.in("campus_id", campusIds);
  const { data: apps, error: appsError } = await appQuery;
  if (appsError) console.error("[searchGlobal] guardian application lookup", appsError.message);

  const latestByGuardian = new Map<string, { id: string; status: string; campusName: string | null }>();
  for (const app of (apps ?? []) as Array<{
    id: string;
    guardian_id: string;
    status: string;
    campus: { name?: string } | null;
  }>) {
    if (!latestByGuardian.has(app.guardian_id)) {
      latestByGuardian.set(app.guardian_id, {
        id: app.id,
        status: app.status,
        campusName: app.campus?.name ?? null,
      });
    }
  }

  const results: SearchResultItem[] = [];
  for (const [id, guardian] of candidates) {
    const latest = latestByGuardian.get(id);
    // No application in an accessible campus: there's no guardian profile
    // page to fall back to, so this row is skipped rather than shown with a
    // dead link — the DATA HONESTY choice, not an oversight.
    if (!latest) continue;
    results.push({
      id,
      title: `${guardian.first_name} ${guardian.last_name}`.trim(),
      subtitle: subtitleOf([latest.campusName, getStatusConfig(latest.status).label, guardian.phone]),
      href: `/staff/applications/${latest.id}`,
    });
    if (results.length >= RESULTS_PER_CATEGORY) break;
  }
  return results;
}

interface StudentCandidate {
  id: string;
  first_name: string;
  last_name: string;
}

async function searchStudents(
  supabase: AnyQuery,
  term: string,
  campusIds: string[]
): Promise<SearchResultItem[]> {
  const pattern = likePattern(term);

  const { data: studentRows, error } = await supabase
    .from("student")
    .select("id, first_name, last_name")
    .or(`first_name.ilike."${pattern}",last_name.ilike."${pattern}"`)
    .limit(TEXT_CANDIDATE_LIMIT);
  if (error) console.error("[searchGlobal] student text search", error.message);

  const students = (studentRows ?? []) as StudentCandidate[];
  if (students.length === 0) return [];

  let appQuery = supabase
    .from("application")
    .select("id, student_id, status, created_at, campus:campus_id(name), guardian:guardian_id(phone)")
    .in(
      "student_id",
      students.map((s) => s.id)
    )
    .order("created_at", { ascending: false });
  if (scopesToCampuses(campusIds)) appQuery = appQuery.in("campus_id", campusIds);
  const { data: apps, error: appsError } = await appQuery;
  if (appsError) console.error("[searchGlobal] student application lookup", appsError.message);

  const latestByStudent = new Map<
    string,
    { status: string; campusName: string | null; phone: string | null }
  >();
  for (const app of (apps ?? []) as Array<{
    student_id: string;
    status: string;
    campus: { name?: string } | null;
    guardian: { phone?: string | null } | null;
  }>) {
    if (!latestByStudent.has(app.student_id)) {
      latestByStudent.set(app.student_id, {
        status: app.status,
        campusName: app.campus?.name ?? null,
        phone: app.guardian?.phone ?? null,
      });
    }
  }

  const results: SearchResultItem[] = [];
  for (const student of students) {
    const latest = latestByStudent.get(student.id);
    // Same honesty rule as guardians: no accessible-campus application means
    // no row, not a link to a page this staff member can't act on.
    if (!latest) continue;
    results.push({
      id: student.id,
      title: `${student.first_name} ${student.last_name}`.trim(),
      subtitle: subtitleOf([latest.campusName, getStatusConfig(latest.status).label, latest.phone]),
      href: `/staff/students/${student.id}`,
    });
    if (results.length >= RESULTS_PER_CATEGORY) break;
  }
  return results;
}

/**
 * Server action backing the global search palette. Gated on
 * requireStaffSession like every staff action; returns an honest empty
 * result rather than throwing for a too-short query so the client's "Type
 * at least 2 characters" state is driven by real state, not a caught error.
 */
export async function searchGlobal(rawQuery: string): Promise<GlobalSearchResult> {
  const session = await requireStaffSession();
  const term = rawQuery.trim();
  if (term.length < MIN_SEARCH_QUERY_LENGTH) return EMPTY_RESULT;

  const campusIds = getAccessibleCampusIds(session);
  const digits = digitsOf(term);
  const supabase = createServiceRoleClient();

  const [leads, families, students] = await Promise.all([
    searchLeads(supabase, term, digits, campusIds),
    searchFamilies(supabase, term, digits, campusIds),
    searchStudents(supabase, term, campusIds),
  ]);

  return { leads, families, students };
}
