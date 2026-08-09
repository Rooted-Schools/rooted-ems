/**
 * Google Sheets → lead pipeline sync.
 *
 * The campus interest forms (Google Forms + Squarespace) still write to
 * Google Sheets daily. This module reads those sheets directly (they are
 * link-readable; no Google API credentials needed via the gviz CSV export),
 * dedupes against existing leads by email + campus, and inserts only new
 * families.
 *
 * Freshness rule: rows submitted within FRESH_HOURS get the full response
 * engine (welcome email, staff routing, next-day follow-up) because they are
 * hot inquiries. Older rows import quietly — present in the pipeline but
 * with automation disarmed — exactly like the July 2026 bulk import.
 *
 * Invoked from the daily cron (/api/cron/sync-lead-sheets) and the staff
 * "Sync sheets" button. Service-role writes; never throws.
 */

import { createServiceRoleClient } from "@rooted-ems/database/server";
import { createLeadFromInquiry } from "@/lib/mutations/leads";

const FRESH_HOURS = 72;
const SYNC_TAG = "sheet-sync";

export type TabKind = "interest_form" | "scholarlead" | "squarespace" | "contact_form" | "crn_consolidated";

interface SheetTab {
  /**
   * Human-readable label for logging/error messages (e.g. "Synced from
   * ${tab.sheetName}", fetch error prefixes). Optional when the tab is
   * addressed by `gid` — provide a descriptive fallback in that case since
   * there's no sheet name to fall back on.
   */
  sheetName?: string;
  /**
   * Direct tab addressing by Google Sheets gid. Immune to future tab
   * renames — unlike `sheetName`, which the gviz CSV export silently
   * resolves to the spreadsheet's default tab when no match is found
   * (rather than erroring), so a stale name degrades silently instead of
   * failing loudly. Prefer `gid` for any tab that matters.
   */
  gid?: string;
  kind: TabKind;
}

interface SheetConfig {
  campusShortCode: string;
  spreadsheetId: string;
  tabs: SheetTab[];
}

// Campus interest-form sheets. Adding a campus = adding an entry here.
const SHEET_CONFIGS: SheetConfig[] = [
  {
    campusShortCode: "CRN",
    spreadsheetId: "1he5CZL_vVW6v9gCimeEQbwhefWgP4esBkUZYRiOJMbM",
    tabs: [
      // The four tab names this used to list ("Interest Form", "Scholarlead
      // Interest Form", "Squarespace Contacts", "Contact Form") don't exist
      // in the real spreadsheet — the gviz CSV export silently falls back to
      // the default tab for any unmatched name, so all four fetches were
      // returning the same single real tab, whose columns matched none of
      // the extraction cases above. Addressed by gid instead of name so a
      // future rename can't silently misroute this again.
      { gid: "1886397153", sheetName: "CR Neal Interest Sheet", kind: "crn_consolidated" },
    ],
  },
  {
    campusShortCode: "RSC",
    spreadsheetId: "1JiQs2fSYaFVnDWo0s-jiJXavi_SxZySaofLXK2Uumzg",
    tabs: [
      { sheetName: "Interest Form", kind: "interest_form" },
      { sheetName: "Scholarlead Interest Form", kind: "scholarlead" },
      { sheetName: "Contact Form", kind: "contact_form" },
    ],
  },
];

// ─── CSV parsing (RFC 4180-ish, handles quoted fields with commas/newlines) ──

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

// ─── Normalizers (mirror the bulk import's rules) ────────────────────────────

function cleanCell(v: string | undefined): string {
  const s = (v ?? "").trim();
  return s.toLowerCase() === "nan" ? "" : s;
}

function normEmail(v: string | undefined): string | null {
  const e = cleanCell(v).toLowerCase();
  return e.includes("@") && e.split("@")[1]?.includes(".") ? e : null;
}

function normGrade(v: string | undefined): string | null {
  const g = cleanCell(v).toLowerCase().replace(/\.$/, "");
  if (!g) return null;
  if (g.startsWith("k")) return "K";
  const m = g.match(/^(\d{1,2})/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return m[1];
  return null;
}

function splitName(full: string): { first: string; last: string } {
  const parts = cleanCell(full).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

function parseTimestamp(v: string | undefined): Date | null {
  const s = cleanCell(v);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// ─── Row extraction per tab kind ─────────────────────────────────────────────

export interface CandidateLead {
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  student_first_name?: string;
  entry_grade?: string;
  zip?: string;
  preferred_language?: string;
  notes?: string;
  source: string;
  source_detail: string;
  submitted_at: Date | null;
}

export function extractRows(kind: TabKind, header: string[], rows: string[][], formName: string): CandidateLead[] {
  const col = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  const get = (row: string[], name: string) => row[col(name)] ?? "";

  const out: CandidateLead[] = [];
  for (const row of rows) {
    if (kind === "interest_form") {
      const email = normEmail(get(row, "Parent Email"));
      if (!email) continue;
      const { first, last } = splitName(get(row, "Parent Name"));
      const student = cleanCell(get(row, "Student Name")).split(/\s+/)[0] || undefined;
      out.push({
        email,
        first_name: first,
        last_name: last,
        student_first_name: student,
        entry_grade: normGrade(get(row, "Student Grade")) ?? undefined,
        zip: cleanCell(get(row, "Zip Code")).slice(0, 10) || undefined,
        source: "website",
        source_detail: `${formName} Interest Form (${SYNC_TAG})`,
        submitted_at: parseTimestamp(get(row, "Timestamp")),
      });
    } else if (kind === "scholarlead") {
      const email = normEmail(get(row, "Primary Guardian Email"));
      if (!email) continue;
      const src = cleanCell(get(row, "Lead Source")).toLowerCase();
      out.push({
        email,
        first_name: cleanCell(get(row, "Primary Guardian First Name")),
        last_name: cleanCell(get(row, "Primary Guardian Last Name")),
        phone: cleanCell(get(row, "Primary Guardian Phone Number")) || undefined,
        student_first_name: cleanCell(get(row, "Scholar 1 First Name")) || undefined,
        entry_grade: normGrade(get(row, "Scholar 1 Current Grade")) ?? undefined,
        zip: cleanCell(get(row, "Zip")).slice(0, 10) || undefined,
        preferred_language: cleanCell(get(row, "Prefered Language")).toLowerCase().includes("spanish") ? "es" : "en",
        notes: cleanCell(get(row, "Notes")) || undefined,
        source: src === "facebook" ? "ad" : "other",
        source_detail: `Scholarlead form${src ? ` — ${src}` : ""} (${SYNC_TAG})`,
        submitted_at: parseTimestamp(get(row, "Timestamp")),
      });
    } else if (kind === "squarespace") {
      const email = normEmail(get(row, "Email"));
      if (!email) continue;
      out.push({
        email,
        first_name: cleanCell(get(row, "First Name")),
        last_name: cleanCell(get(row, "Last Name")),
        source: "website",
        source_detail: `Squarespace contact (${SYNC_TAG})`,
        submitted_at: parseTimestamp(get(row, "Created On")),
      });
    } else if (kind === "contact_form") {
      const email = normEmail(get(row, "Email"));
      if (!email) continue;
      const reason = cleanCell(get(row, "Reason"));
      const message = cleanCell(get(row, "Message"));
      out.push({
        email,
        first_name: cleanCell(get(row, "First Name")),
        last_name: cleanCell(get(row, "Last Name")),
        phone: cleanCell(get(row, "Phone")) || undefined,
        notes: [reason && `Reason: ${reason}`, message && `Message: ${message}`].filter(Boolean).join("\n") || undefined,
        source: "website",
        source_detail: `${formName} Contact Form (${SYNC_TAG})`,
        submitted_at: parseTimestamp(get(row, "Timestamp")),
      });
    } else {
      // crn_consolidated — CR Neal's single real interest-list tab. The four
      // tab names this campus used to be configured with don't exist in the
      // spreadsheet; this is the one real tab (see SHEET_CONFIGS), and its
      // columns are its own shape, matching none of the cases above.
      const email = normEmail(get(row, "Parent/Guardian Email"));
      if (!email) continue;
      const notes = cleanCell(get(row, "Notes"));
      const status = cleanCell(get(row, "Status"));
      const leadSource = cleanCell(get(row, "Lead Source"));
      const leadSourceLower = leadSource.toLowerCase();
      const isAd = ["meta", "facebook", "instagram", "google", "ad"].some((kw) => leadSourceLower.includes(kw));
      // The org has already mapped each historical inquiry's grade-at-submission
      // to the grade the student will enter for the 2027-28 cohort this pilot
      // is opening — prefer that pre-computed value. Real distribution check:
      // values above 12 (13/14/15 — ~230 rows) are not bad data, they mean
      // the student will already have graduated by 2027-28 and this lead is
      // not a current prospect for this cycle. Falling back to the raw
      // at-submission grade for those rows would fabricate false currency —
      // e.g. showing "grade 8" from a submission years ago for a student who
      // will actually be past 12th grade. Only fall back to the raw grade
      // when the mapped column is genuinely blank (never attempted), and
      // flag the graduated case in notes instead of silently leaving it
      // blank with no explanation.
      const mappedRaw = cleanCell(get(row, "Mapped 2027 grade"));
      const mappedNum = Number(mappedRaw);
      const mappedIndicatesGraduated = mappedRaw !== "" && Number.isFinite(mappedNum) && mappedNum > 12;
      const entryGrade = mappedIndicatesGraduated
        ? undefined
        : normGrade(mappedRaw) ?? normGrade(get(row, "Student grade when contact submitted")) ?? undefined;
      const graduatedNote = mappedIndicatesGraduated
        ? `Mapped grade (${mappedRaw}) indicates this student will have graduated before the 2027-28 cohort — likely not a current prospect.`
        : null;
      out.push({
        email,
        first_name: cleanCell(get(row, "Parent/Guardian First Name")),
        last_name: cleanCell(get(row, "Parent/Guardian Last Name")),
        phone: cleanCell(get(row, "Parent/Guardian Phone Number")) || undefined,
        student_first_name: cleanCell(get(row, "Student Name")).split(/\s+/)[0] || undefined,
        entry_grade: entryGrade,
        zip: cleanCell(get(row, "ZipCode")).slice(0, 10) || undefined,
        notes: [status && `Status: ${status}`, notes, graduatedNote].filter(Boolean).join("\n") || undefined,
        source: isAd ? "ad" : "other",
        source_detail: leadSource || "CR Neal interest form",
        submitted_at: parseTimestamp(get(row, "Timestamp")),
      });
    }
  }
  return out;
}

// ─── Duplicate handling ───────────────────────────────────────────────────
//
// A family often appears more than once across a campus's tabs (Interest
// Form, then Squarespace, then a later Contact Form) or across sync runs.
// The old behavior treated any repeat email as fully handled and discarded
// the row — so a later submission with a corrected phone number or a
// filled-in grade never reached the record. Every duplicate is now compared
// field by field against what we already have: a field is filled in if it
// was missing, and overwritten only when the new submission is demonstrably
// newer than the last time the record changed (comparing the candidate's
// own submitted_at against the record's updated_at) — never blind overwrite,
// never silently drop a correction either.

const MERGE_FIELDS = [
  "phone",
  "first_name",
  "last_name",
  "student_first_name",
  "entry_grade",
  "zip",
  "preferred_language",
] as const;
type MergeField = (typeof MERGE_FIELDS)[number];

export interface ExistingLead {
  id: string;
  updated_at: string;
  notes: string | null;
  fields: Record<MergeField, string | null>;
}

/**
 * Decide what a duplicate submission should change on the existing lead.
 * Returns null when there is nothing worth writing (no actual difference).
 */
export function computeMerge(
  existing: ExistingLead,
  candidate: CandidateLead
): { patch: Record<string, string>; changed: string[] } | null {
  const patch: Record<string, string> = {};
  const changed: string[] = [];
  const candidateIsNewer =
    candidate.submitted_at !== null && candidate.submitted_at.getTime() > new Date(existing.updated_at).getTime();

  const candidateValues: Record<MergeField, string | undefined> = {
    phone: candidate.phone,
    first_name: candidate.first_name || undefined,
    last_name: candidate.last_name || undefined,
    student_first_name: candidate.student_first_name,
    entry_grade: candidate.entry_grade,
    zip: candidate.zip,
    preferred_language: candidate.preferred_language,
  };

  for (const field of MERGE_FIELDS) {
    const have = existing.fields[field];
    const got = candidateValues[field];
    if (!got) continue; // nothing offered, nothing to consider
    const isMissing = have === null || have === "";
    if (isMissing) {
      patch[field] = got;
      changed.push(`${field}: (blank) → "${got}"`);
    } else if (have !== got && candidateIsNewer) {
      patch[field] = got;
      changed.push(`${field}: "${have}" → "${got}"`);
    }
  }

  // Notes are free text — append rather than overwrite, so earlier context
  // from another tab is never lost.
  if (candidate.notes && candidate.notes.trim() && !(existing.notes ?? "").includes(candidate.notes.trim())) {
    patch.notes = existing.notes ? `${existing.notes}\n${candidate.notes.trim()}` : candidate.notes.trim();
    changed.push("notes: appended");
  }

  return changed.length > 0 ? { patch, changed } : null;
}

// ─── Sync ────────────────────────────────────────────────────────────────────

export interface SyncSummary {
  checked: number;
  added: number;
  welcomed: number; // fresh rows that got the response engine
  /** Duplicate rows that carried a new/newer value and updated the record. */
  updated: number;
  /** Duplicate rows seen but with nothing new to add (already fully current). */
  duplicates: number;
  errors: string[];
}

export async function syncLeadSheets(): Promise<SyncSummary> {
  const supabase = createServiceRoleClient();
  const summary: SyncSummary = { checked: 0, added: 0, welcomed: 0, updated: 0, duplicates: 0, errors: [] };
  const now = Date.now();
  const nowIso = new Date().toISOString();

  for (const config of SHEET_CONFIGS) {
    const { data: campusRows } = await supabase
      .from("campus")
      .select("id, name")
      .eq("short_code", config.campusShortCode)
      .limit(1);
    const campus = campusRows?.[0] as { id: string; name: string } | undefined;
    if (!campus) {
      summary.errors.push(`campus ${config.campusShortCode} not found`);
      continue;
    }

    // All existing leads for this campus, with the fields we can merge into
    // (paged past the 1k cap) — a Map, not a Set, so a duplicate can be
    // compared and corrected rather than just recognized and skipped.
    const existing = new Map<string, ExistingLead>();
    for (let offset = 0; ; offset += 1000) {
      const { data } = await supabase
        .from("lead")
        .select("id, email, phone, first_name, last_name, student_first_name, entry_grade, zip, preferred_language, notes, updated_at")
        .eq("campus_id", campus.id)
        .not("email", "is", null)
        .range(offset, offset + 999);
      for (const r of (data ?? []) as Record<string, string | null>[]) {
        existing.set((r.email as string).toLowerCase(), {
          id: r.id as string,
          updated_at: r.updated_at as string,
          notes: r.notes,
          fields: {
            phone: r.phone,
            first_name: r.first_name,
            last_name: r.last_name,
            student_first_name: r.student_first_name,
            entry_grade: r.entry_grade,
            zip: r.zip,
            preferred_language: r.preferred_language,
          },
        });
      }
      if (!data || data.length < 1000) break;
    }

    for (const tab of config.tabs) {
      // Purely for logging/error messages — the fetch itself uses gid when
      // present (see below), never this label.
      const tabLabel = tab.sheetName ?? `gid:${tab.gid}`;
      try {
        const addressing = tab.gid ? `&gid=${tab.gid}` : `&sheet=${encodeURIComponent(tab.sheetName!)}`;
        const url = `https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/gviz/tq?tqx=out:csv${addressing}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
        if (!response.ok) {
          summary.errors.push(`${config.campusShortCode}/${tabLabel}: HTTP ${response.status}`);
          continue;
        }
        const rows = parseCsv(await response.text());
        if (rows.length < 2) continue;
        const candidates = extractRows(tab.kind, rows[0], rows.slice(1), campus.name);
        summary.checked += candidates.length;

        for (const candidate of candidates) {
          const dup = existing.get(candidate.email);
          if (dup) {
            const merge = computeMerge(dup, candidate);
            if (!merge) {
              summary.duplicates++;
              continue;
            }
            const { error } = await supabase.from("lead").update(merge.patch).eq("id", dup.id);
            if (error) {
              summary.errors.push(`${candidate.email}: ${error.message}`);
              continue;
            }
            await supabase.from("lead_activity").insert({
              lead_id: dup.id,
              activity_type: "inquiry",
              body: `Duplicate submission on ${tabLabel} updated this record — ${merge.changed.join("; ")}.`,
            });
            // Reflect the merge so a third occurrence in this same run
            // compares against the corrected state, not the stale original.
            Object.assign(dup.fields, merge.patch);
            if (merge.patch.notes) dup.notes = merge.patch.notes;
            summary.updated++;
            continue;
          }

          const isFresh =
            candidate.submitted_at !== null &&
            now - candidate.submitted_at.getTime() < FRESH_HOURS * 60 * 60 * 1000;

          if (isFresh) {
            // Hot inquiry — full response engine via the shared entry point.
            const result = await createLeadFromInquiry({
              campus_id: campus.id,
              first_name: candidate.first_name || candidate.email.split("@")[0],
              last_name: candidate.last_name || "(no name given)",
              email: candidate.email,
              phone: candidate.phone,
              preferred_language: candidate.preferred_language,
              student_first_name: candidate.student_first_name,
              entry_grade: candidate.entry_grade,
              source: candidate.source,
              source_detail: candidate.source_detail,
            });
            if (result.error) {
              summary.errors.push(`${candidate.email}: ${result.error}`);
              continue;
            }
            // Fields the inquiry entry point doesn't accept
            await supabase
              .from("lead")
              .update({ zip: candidate.zip ?? null, notes: candidate.notes ?? null })
              .eq("id", result.data!.id);
            summary.added++;
            summary.welcomed++;
            existing.set(candidate.email, {
              id: result.data!.id,
              updated_at: nowIso,
              notes: candidate.notes ?? null,
              fields: {
                phone: candidate.phone ?? null,
                first_name: candidate.first_name || candidate.email.split("@")[0],
                last_name: candidate.last_name || "(no name given)",
                student_first_name: candidate.student_first_name ?? null,
                entry_grade: candidate.entry_grade ?? null,
                zip: candidate.zip ?? null,
                preferred_language: candidate.preferred_language ?? "en",
              },
            });
          } else {
            // Older straggler — quiet import, automation disarmed.
            const { data: lead, error } = await supabase
              .from("lead")
              .insert({
                campus_id: campus.id,
                first_name: candidate.first_name || candidate.email.split("@")[0],
                last_name: candidate.last_name || "(no name given)",
                email: candidate.email,
                phone: candidate.phone ?? null,
                sms_consent: false,
                preferred_language: candidate.preferred_language ?? "en",
                student_first_name: candidate.student_first_name ?? null,
                entry_grade: candidate.entry_grade ?? null,
                zip: candidate.zip ?? null,
                notes: candidate.notes ?? null,
                stage: "new",
                source: candidate.source,
                source_detail: candidate.source_detail,
                created_at: candidate.submitted_at?.toISOString() ?? nowIso,
                reengaged_at: nowIso,
                next_follow_up_at: null,
              })
              .select("id")
              .single();
            if (error) {
              summary.errors.push(`${candidate.email}: ${error.message}`);
              continue;
            }
            await supabase.from("lead_activity").insert({
              lead_id: lead.id,
              activity_type: "inquiry",
              body: `Synced from ${tabLabel}.`,
            });
            summary.added++;
            existing.set(candidate.email, {
              id: lead.id as string,
              updated_at: nowIso,
              notes: candidate.notes ?? null,
              fields: {
                phone: candidate.phone ?? null,
                first_name: candidate.first_name || candidate.email.split("@")[0],
                last_name: candidate.last_name || "(no name given)",
                student_first_name: candidate.student_first_name ?? null,
                entry_grade: candidate.entry_grade ?? null,
                zip: candidate.zip ?? null,
                preferred_language: candidate.preferred_language ?? "en",
              },
            });
          }
        }
      } catch (err) {
        summary.errors.push(
          `${config.campusShortCode}/${tabLabel}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  return summary;
}
