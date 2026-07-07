/**
 * Tabling Calendar → events sync.
 *
 * Campus outreach teams keep a Google Sheet of community events (festivals,
 * fairs) they might table at, with a STATUS column. When an event turns
 * "Confirmed", this sync pulls it into the events table as an INTERNAL
 * (unpublished) tabling event: it shows on the staff Events calendar but
 * never on the public /events RSVP page, because families don't register
 * with Rooted for someone else's festival — staff go there to recruit.
 *
 * Idempotent: dedupes by campus + event title, so re-running updates dates
 * and details rather than duplicating. Runs from the daily cron and the
 * "Sync calendar" button on the staff Events page.
 */

import { createServiceRoleClient } from "@rooted-ems/database/server";

interface TablingSheet {
  campusShortCode: string;
  spreadsheetId: string;
  /** Tab name — both campuses use a "Tabling Calendar" tab. */
  sheetName: string;
}

const TABLING_SHEETS: TablingSheet[] = [
  {
    campusShortCode: "RSC",
    spreadsheetId: "184g06Aw31lSAx2Uabq0ftARVnekb5XKIvB53tOY5pRY",
    sheetName: "Tabling Calendar",
  },
  {
    campusShortCode: "CRN",
    spreadsheetId: "1_e79GJ3HTdUGVVQtMyS3RPbo_vRNfQyRJ6TL9nkqXe4",
    sheetName: "Tabling Calendar",
  },
];

// ─── CSV parse (RFC4180-ish) ─────────────────────────────────────────────────

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

/**
 * Best-effort date parse for the messy DATE / RECURRENCE column. Strips
 * parentheticals ("(2025 was 10am to 4pm)") and recurrence words, then tries
 * V8 Date parsing and a Month-DD-YYYY fallback. Returns noon-local to avoid
 * timezone day-shift; null if nothing parseable (event is then skipped).
 */
function parseEventDate(raw: string): Date | null {
  const cleaned = raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(around|verify|weekly|recurring|to|through|–|-)\b/gi, " ")
    // Strip ordinal suffixes ("June 14th" → "June 14") so both parse paths work.
    .replace(/(\d{1,2})(st|nd|rd|th)\b/gi, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;

  const direct = new Date(cleaned);
  if (!isNaN(direct.getTime()) && direct.getFullYear() > 2020) {
    return new Date(Date.UTC(direct.getFullYear(), direct.getMonth(), direct.getDate(), 16, 0, 0));
  }

  const m = cleaned.match(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i
  );
  if (m) {
    const d = new Date(`${m[1]} ${m[2]}, ${m[3]}`);
    if (!isNaN(d.getTime())) {
      return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 16, 0, 0));
    }
  }
  return null;
}

function col(header: string[], name: string): number {
  return header.findIndex((h) => h.trim().toUpperCase() === name.toUpperCase());
}

export interface TablingSyncSummary {
  checked: number;
  confirmed: number;
  added: number;
  updated: number;
  skipped_no_date: number;
  errors: string[];
}

export async function syncTablingEvents(): Promise<TablingSyncSummary> {
  const supabase = createServiceRoleClient();
  const summary: TablingSyncSummary = {
    checked: 0, confirmed: 0, added: 0, updated: 0, skipped_no_date: 0, errors: [],
  };

  for (const sheet of TABLING_SHEETS) {
    const { data: campusRows } = await supabase
      .from("campus").select("id, name").eq("short_code", sheet.campusShortCode).limit(1);
    const campus = campusRows?.[0] as { id: string; name: string } | undefined;
    if (!campus) { summary.errors.push(`campus ${sheet.campusShortCode} not found`); continue; }

    try {
      // headers=0 stops gviz from auto-detecting (and mangling) header rows on
      // sheets with frozen rows — we locate the real header row ourselves.
      const url = `https://docs.google.com/spreadsheets/d/${sheet.spreadsheetId}/gviz/tq?tqx=out:csv&headers=0&sheet=${encodeURIComponent(sheet.sheetName)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
      if (!res.ok) { summary.errors.push(`${sheet.campusShortCode}: HTTP ${res.status}`); continue; }
      const rows = parseCsv(await res.text());

      // Header row = the one containing EVENT NAME (tolerates a title row).
      const headerIdx = rows.findIndex((r) => r.some((c) => c.trim().toUpperCase() === "EVENT NAME"));
      if (headerIdx < 0) { summary.errors.push(`${sheet.campusShortCode}: no header row`); continue; }
      const header = rows[headerIdx];
      const iStatus = col(header, "STATUS");
      const iName = col(header, "EVENT NAME");
      const iDate = col(header, "DATE / RECURRENCE");
      const iType = col(header, "TYPE");
      const iZone = col(header, "ZONE");
      const iLoc = col(header, "LOCATION");
      const iReach = col(header, "REACH / AUDIENCE");
      const iContact = col(header, "CONTACT / SITE");
      if (iName < 0 || iStatus < 0 || iDate < 0) {
        summary.errors.push(`${sheet.campusShortCode}: missing key columns`); continue;
      }

      for (const r of rows.slice(headerIdx + 1)) {
        const title = (r[iName] ?? "").trim();
        if (!title) continue;
        summary.checked++;
        const status = (r[iStatus] ?? "").trim().toLowerCase();
        if (!status.includes("confirm")) continue;
        summary.confirmed++;

        const startsAt = parseEventDate(r[iDate] ?? "");
        if (!startsAt) { summary.skipped_no_date++; continue; }

        const zone = (r[iZone] ?? "").trim();
        const location = [(r[iLoc] ?? "").trim(), zone && `(${zone})`].filter(Boolean).join(" ");
        const description = [
          (r[iType] ?? "").trim() && `Type: ${(r[iType] ?? "").trim()}`,
          (r[iReach] ?? "").trim() && `Reach: ${(r[iReach] ?? "").trim()}`,
          `Scheduled: ${(r[iDate] ?? "").trim()}`,
          (r[iContact] ?? "").trim() && `Contact: ${(r[iContact] ?? "").trim()}`,
          "— Synced from the Tabling Calendar.",
        ].filter(Boolean).join("\n");

        // Dedupe by campus + title (case-insensitive).
        const { data: existingRows } = await supabase
          .from("event")
          .select("id")
          .eq("campus_id", campus.id)
          .ilike("title", title)
          .limit(1);
        const existingId = (existingRows?.[0] as { id: string } | undefined)?.id;

        if (existingId) {
          const { error } = await supabase
            .from("event")
            .update({ starts_at: startsAt.toISOString(), location: location || null, description })
            .eq("id", existingId);
          if (error) summary.errors.push(`${title}: ${error.message}`);
          else summary.updated++;
        } else {
          const { error } = await supabase.from("event").insert({
            campus_id: campus.id,
            title,
            description,
            event_type: "tabling",
            location: location || null,
            starts_at: startsAt.toISOString(),
            is_published: false, // internal outreach — never on the public RSVP page
          });
          if (error) summary.errors.push(`${title}: ${error.message}`);
          else summary.added++;
        }
      }
    } catch (err) {
      summary.errors.push(`${sheet.campusShortCode}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return summary;
}
