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

type TabKind = "interest_form" | "scholarlead" | "squarespace" | "contact_form";

interface SheetTab {
  sheetName: string;
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
      { sheetName: "Interest Form", kind: "interest_form" },
      { sheetName: "Scholarlead Interest Form", kind: "scholarlead" },
      { sheetName: "Squarespace Contacts", kind: "squarespace" },
      { sheetName: "Contact Form", kind: "contact_form" },
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

interface CandidateLead {
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

function extractRows(kind: TabKind, header: string[], rows: string[][], formName: string): CandidateLead[] {
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
    } else {
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
    }
  }
  return out;
}

// ─── Sync ────────────────────────────────────────────────────────────────────

export interface SyncSummary {
  checked: number;
  added: number;
  welcomed: number; // fresh rows that got the response engine
  errors: string[];
}

export async function syncLeadSheets(): Promise<SyncSummary> {
  const supabase = createServiceRoleClient();
  const summary: SyncSummary = { checked: 0, added: 0, welcomed: 0, errors: [] };
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

    // All existing lead emails for this campus (paged past the 1k cap)
    const existing = new Set<string>();
    for (let offset = 0; ; offset += 1000) {
      const { data } = await supabase
        .from("lead")
        .select("email")
        .eq("campus_id", campus.id)
        .not("email", "is", null)
        .range(offset, offset + 999);
      for (const r of data ?? []) existing.add((r as { email: string }).email.toLowerCase());
      if (!data || data.length < 1000) break;
    }

    for (const tab of config.tabs) {
      try {
        const url = `https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab.sheetName)}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
        if (!response.ok) {
          summary.errors.push(`${config.campusShortCode}/${tab.sheetName}: HTTP ${response.status}`);
          continue;
        }
        const rows = parseCsv(await response.text());
        if (rows.length < 2) continue;
        const candidates = extractRows(tab.kind, rows[0], rows.slice(1), campus.name);
        summary.checked += candidates.length;

        for (const candidate of candidates) {
          if (existing.has(candidate.email)) continue;
          existing.add(candidate.email); // also dedupes within this run

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
            } else {
              // Fields the inquiry entry point doesn't accept
              await supabase
                .from("lead")
                .update({ zip: candidate.zip ?? null, notes: candidate.notes ?? null })
                .eq("id", result.data!.id);
              summary.added++;
              summary.welcomed++;
            }
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
            } else {
              await supabase.from("lead_activity").insert({
                lead_id: lead.id,
                activity_type: "inquiry",
                body: `Synced from ${tab.sheetName}.`,
              });
              summary.added++;
            }
          }
        }
      } catch (err) {
        summary.errors.push(
          `${config.campusShortCode}/${tab.sheetName}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  return summary;
}
