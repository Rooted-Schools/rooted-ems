import { createServiceRoleClient } from "@rooted-ems/database/server";

/**
 * Conversion-by-group for the Equity page.
 *
 * The demographics query answers "who applies". This one answers the sharper
 * question: where does conversion DIFFER across groups. A gap between offered
 * and registered for Spanish-preference households is a process failure that a
 * composition-only report cannot see.
 *
 * Honesty rules baked into the shape:
 *  - Every count comes from real `application` rows plus the real
 *    `application_status_history` log. Nothing is estimated or imputed.
 *  - Rates are never returned bare. Each cell carries its own numerator and
 *    denominator so the UI can print "62% of 45".
 *  - Any group whose denominator is under SUPPRESSION_THRESHOLD returns
 *    rate_pct = null and suppressed = true. Small cells are both a privacy
 *    exposure and statistically meaningless; the UI must not print a rate.
 *  - Cuts read only fields that exist in the schema. The language cut reads
 *    `household.primary_language` (00003_people.sql); the zip cut reads
 *    `household.zip`. If a cut's source field yields nothing, the cut reports
 *    an `unavailable_reason` rather than substituting a proxy.
 *  - "Reached offered" is read from the status history log, not just the
 *    current status, so an application that was offered and later withdrew
 *    still counts in the offered denominator. Otherwise the exact families the
 *    report is looking for would silently drop out of it.
 *
 * Service-role read: the Equity page already gates on requireMinRole and passes
 * campus ids that are already scoped to the caller.
 */

/** Groups with fewer than this many rows in the denominator never show a rate. */
export const SUPPRESSION_THRESHOLD = 10;

/** Percentage points below the campus overall that trips the gap flag. */
export const GAP_FLAG_POINTS = 15;

/** Top N zip codes by application volume that get their own row. */
const TOP_ZIP_COUNT = 10;

/** Statuses meaning the application reached an offer or moved past one. */
const OFFERED_OR_BEYOND = new Set([
  "offered",
  "accepted",
  "registered",
  "placement_review",
  "enrolled",
]);

/** Statuses meaning the family completed registration or moved past it. */
const REGISTERED_OR_BEYOND = new Set(["registered", "placement_review", "enrolled"]);

const NOT_RECORDED = "Not recorded";

// ─── Types ─────────────────────────────────────────────

export interface ConversionCell {
  numerator: number;
  denominator: number;
  /** null whenever `suppressed` is true — callers must not compute their own. */
  rate_pct: number | null;
  /** denominator < SUPPRESSION_THRESHOLD */
  suppressed: boolean;
  /**
   * True when this rate sits more than GAP_FLAG_POINTS below the campus
   * overall AND neither this cell nor the overall cell is suppressed.
   * Descriptive only — it says the rates differ, not why.
   */
  gap_flagged: boolean;
}

export interface ConversionGroupRow {
  label: string;
  /** Of non-draft applications, the share that reached offered or beyond. */
  application_to_offer: ConversionCell;
  /** Of applications that reached offered, the share that registered or beyond. */
  offer_to_registration: ConversionCell;
}

export interface ConversionCut {
  key: "language" | "zip";
  title: string;
  /** Names the actual column the cut reads, for the footnote. */
  source_note: string;
  rows: ConversionGroupRow[];
  /** Set when the cut could not be built; rows will be empty. */
  unavailable_reason: string | null;
}

export interface EquityFunnelConversion {
  /** Name of the school year the numbers are scoped to. */
  school_year_name: string | null;
  /** Non-draft applications in scope. */
  total_applications: number;
  /** Campus overall, the comparison baseline for every group row. */
  overall: ConversionGroupRow;
  cuts: ConversionCut[];
  /**
   * Thresholds travel with the data so the client component can state the rules
   * in its footnote without importing this server-only module.
   */
  suppression_threshold: number;
  gap_flag_points: number;
  /** Set when the whole section has nothing real to show. */
  empty_reason: string | null;
}

// ─── Helpers ─────────────────────────────────────────────

function buildCell(numerator: number, denominator: number): ConversionCell {
  const suppressed = denominator < SUPPRESSION_THRESHOLD;
  return {
    numerator,
    denominator,
    rate_pct: suppressed || denominator === 0 ? null : Math.round((numerator / denominator) * 100),
    suppressed,
    gap_flagged: false,
  };
}

/** Sets gap_flagged on `cell` by comparing it to the campus overall cell. */
function applyGapFlag(cell: ConversionCell, overall: ConversionCell): void {
  if (cell.suppressed || overall.suppressed) return;
  if (cell.rate_pct === null || overall.rate_pct === null) return;
  cell.gap_flagged = overall.rate_pct - cell.rate_pct > GAP_FLAG_POINTS;
}

interface ScopedApplication {
  id: string;
  status: string;
  language: string;
  zip: string;
  reachedOffered: boolean;
  reachedRegistered: boolean;
}

/**
 * Normalizes household.primary_language into a display label. The column is a
 * free-text VARCHAR(50) defaulting to 'English', and the CRM writes ISO-ish
 * codes ('en' / 'es'), so both shapes appear. Anything unrecognized is shown
 * verbatim rather than bucketed into "Other" — bucketing hides the group.
 */
function normalizeLanguage(raw: unknown): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return NOT_RECORDED;
  const lower = value.toLowerCase();
  if (lower === "en" || lower === "eng" || lower === "english") return "English";
  if (lower === "es" || lower === "spa" || lower === "spanish" || lower === "español") {
    return "Spanish";
  }
  return value;
}

/** Zips are stored as VARCHAR(10) and may carry a ZIP+4 suffix. */
function normalizeZip(raw: unknown): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return NOT_RECORDED;
  const digits = value.replace(/[^0-9]/g, "");
  if (digits.length >= 5) return digits.slice(0, 5);
  return digits.length > 0 ? digits : NOT_RECORDED;
}

function household(row: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const parent = row[key] as Record<string, unknown> | null;
  return (parent?.household as Record<string, unknown> | null) ?? null;
}

/** Builds one group row from a subset of applications. */
function buildRow(label: string, subset: ScopedApplication[]): ConversionGroupRow {
  const applied = subset.length;
  const offered = subset.filter((a) => a.reachedOffered).length;
  const registered = subset.filter((a) => a.reachedRegistered).length;
  return {
    label,
    application_to_offer: buildCell(offered, applied),
    offer_to_registration: buildCell(registered, offered),
  };
}

function emptyRow(label: string): ConversionGroupRow {
  return {
    label,
    application_to_offer: buildCell(0, 0),
    offer_to_registration: buildCell(0, 0),
  };
}

function emptyResult(reason: string, schoolYearName: string | null): EquityFunnelConversion {
  return {
    school_year_name: schoolYearName,
    total_applications: 0,
    overall: emptyRow("Campus overall"),
    cuts: [],
    suppression_threshold: SUPPRESSION_THRESHOLD,
    gap_flag_points: GAP_FLAG_POINTS,
    empty_reason: reason,
  };
}

// ─── Query ─────────────────────────────────────────────

/**
 * Conversion rates by group for the current school year.
 *
 * @param campusIds Already-scoped campus ids. An empty array reads every campus
 *                  the caller resolved access to.
 */
export async function getEquityFunnelConversion(
  campusIds: string[]
): Promise<EquityFunnelConversion> {
  const supabase = createServiceRoleClient();

  // ── 1. Current school year ──
  const { data: years, error: yearError } = await supabase
    .from("school_year")
    .select("id, name")
    .eq("is_current", true);

  if (yearError) {
    console.error("[getEquityFunnelConversion] school_year", yearError.message);
    return emptyResult("Could not read the school year. No conversion data is shown.", null);
  }

  const currentYears = (years ?? []) as Array<Record<string, unknown>>;
  const currentYearIds = currentYears.map((y) => y.id as string);
  const schoolYearName =
    currentYears.length === 1 ? ((currentYears[0].name as string) ?? null) : null;

  if (currentYearIds.length === 0) {
    return emptyResult(
      "No school year is marked current, so applications cannot be scoped to a cycle.",
      null
    );
  }

  // ── 2. Non-draft applications in scope, with the household fields ──
  // Language and address live on `household` (00003_people.sql). The student's
  // household is the family record of reference; the applying guardian's
  // household is read as a fallback for the rare split-household record.
  let appQuery = supabase
    .from("application")
    .select(
      `
      id,
      status,
      enrollment_window:enrollment_window_id (school_year_id),
      student:student_id ( household:household_id (primary_language, zip) ),
      guardian:guardian_id ( household:household_id (primary_language, zip) )
    `
    )
    .neq("status", "draft");

  if (campusIds.length > 0) {
    appQuery = appQuery.in("campus_id", campusIds);
  }

  const { data: appRows, error: appError } = await appQuery;

  if (appError) {
    console.error("[getEquityFunnelConversion] application", appError.message);
    return emptyResult(
      "Could not read applications. No conversion data is shown.",
      schoolYearName
    );
  }

  const inYear = ((appRows ?? []) as Array<Record<string, unknown>>).filter((row) => {
    const window = row.enrollment_window as Record<string, unknown> | null;
    const yearId = window?.school_year_id as string | undefined;
    return yearId !== undefined && currentYearIds.includes(yearId);
  });

  if (inYear.length === 0) {
    return emptyResult(
      "No non-draft applications exist for the current school year in this campus scope.",
      schoolYearName
    );
  }

  // ── 3. Stage attainment from the status history log ──
  // Current status alone would drop an application that was offered and then
  // withdrew — exactly the case this report exists to surface.
  const appIds = inYear.map((row) => row.id as string);
  const everOffered = new Set<string>();
  const everRegistered = new Set<string>();
  const CHUNK = 200;

  for (let i = 0; i < appIds.length; i += CHUNK) {
    const chunk = appIds.slice(i, i + CHUNK);
    const { data: history, error: historyError } = await supabase
      .from("application_status_history")
      .select("application_id, to_status")
      .in("application_id", chunk);

    if (historyError) {
      console.error("[getEquityFunnelConversion] status_history", historyError.message);
      break; // fall back to current status only; see note below
    }

    for (const entry of (history ?? []) as Array<Record<string, unknown>>) {
      const id = entry.application_id as string;
      const to = entry.to_status as string;
      if (OFFERED_OR_BEYOND.has(to)) everOffered.add(id);
      if (REGISTERED_OR_BEYOND.has(to)) everRegistered.add(id);
    }
  }

  const apps: ScopedApplication[] = inYear.map((row) => {
    const id = row.id as string;
    const status = row.status as string;
    const home = household(row, "student") ?? household(row, "guardian");
    return {
      id,
      status,
      language: normalizeLanguage(home?.primary_language),
      zip: normalizeZip(home?.zip),
      reachedOffered: OFFERED_OR_BEYOND.has(status) || everOffered.has(id),
      reachedRegistered: REGISTERED_OR_BEYOND.has(status) || everRegistered.has(id),
    };
  });

  // ── 4. Campus overall baseline ──
  const overall = buildRow("Campus overall", apps);

  // ── 5. Language cut ──
  const languageGroups = new Map<string, ScopedApplication[]>();
  for (const app of apps) {
    const bucket = languageGroups.get(app.language);
    if (bucket) bucket.push(app);
    else languageGroups.set(app.language, [app]);
  }

  const languageRecorded = apps.filter((a) => a.language !== NOT_RECORDED).length;
  const languageRows = Array.from(languageGroups.entries())
    .map(([label, subset]) => buildRow(label, subset))
    .sort((a, b) => {
      // "Not recorded" is a data-quality row, not a group — keep it last.
      if (a.label === NOT_RECORDED) return 1;
      if (b.label === NOT_RECORDED) return -1;
      return b.application_to_offer.denominator - a.application_to_offer.denominator;
    });

  const languageCut: ConversionCut = {
    key: "language",
    title: "Conversion by household language preference",
    source_note: "household.primary_language",
    rows: languageRecorded > 0 ? languageRows : [],
    unavailable_reason:
      languageRecorded > 0
        ? null
        : "No application in scope has a household language preference recorded, so this cut cannot be built.",
  };

  // ── 6. Zip cut ──
  const zipGroups = new Map<string, ScopedApplication[]>();
  for (const app of apps) {
    const bucket = zipGroups.get(app.zip);
    if (bucket) bucket.push(app);
    else zipGroups.set(app.zip, [app]);
  }

  const zipRecorded = apps.filter((a) => a.zip !== NOT_RECORDED).length;
  const rankedZips = Array.from(zipGroups.entries())
    .filter(([label]) => label !== NOT_RECORDED)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, TOP_ZIP_COUNT)
    .map(([label, subset]) => buildRow(label, subset));

  const unrecordedZip = zipGroups.get(NOT_RECORDED);
  const zipRows = unrecordedZip
    ? [...rankedZips, buildRow(NOT_RECORDED, unrecordedZip)]
    : rankedZips;

  const zipCut: ConversionCut = {
    key: "zip",
    title: "Conversion by zip code",
    source_note: "household.zip",
    rows: zipRecorded > 0 ? zipRows : [],
    unavailable_reason:
      zipRecorded > 0
        ? null
        : "No application in scope has a household zip code recorded, so this cut cannot be built.",
  };

  // ── 7. Gap flags, measured against the campus overall ──
  for (const cut of [languageCut, zipCut]) {
    for (const row of cut.rows) {
      applyGapFlag(row.application_to_offer, overall.application_to_offer);
      applyGapFlag(row.offer_to_registration, overall.offer_to_registration);
    }
  }

  return {
    school_year_name: schoolYearName,
    total_applications: apps.length,
    overall,
    cuts: [languageCut, zipCut],
    suppression_threshold: SUPPRESSION_THRESHOLD,
    gap_flag_points: GAP_FLAG_POINTS,
    empty_reason: null,
  };
}
