// Weekly (and on-demand) sync of the C.R. Neal lead tracker.
//
// Source of truth: the "[Active].Lead_Tracker" tab of the Google Sheet titled
// [Source of Truth].CR_Neal_Academy.Lead_Tracker.
//
// Two levels:
//   - A LEAD is a family, keyed by email. The tracker's duplicate rows for one
//     email collapse to a single lead, so a family is messaged once. Never a
//     duplicate insert, never a delete, operational columns never touched,
//     phone backfill-only and normalized.
//   - A family can have more than one prospective STUDENT (one per distinct
//     grade in the tracker). Those are written to lead_student, reconciled
//     each run (missing grades added, grades no longer present removed), so
//     the app can count and follow up at the student level.
//
// Auth: Authorization Bearer must equal the token in the locked sync_config
// table. Pass {"dryRun": true} to compute the diff without writing.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SHEET_ID = "1he5CZL_vVW6v9gCimeEQbwhefWgP4esBkUZYRiOJMbM";
const TAB = "[Active].Lead_Tracker";
const CAMPUS_ID = "33333333-0000-0000-0000-000000000002";
const SYNCED_FIELDS = ["first_name", "last_name", "zip", "entry_grade", "source", "source_detail", "student_first_name"];

function b64url(bytes) {
  const s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function pemToDer(pem) {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(body);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
async function getGoogleToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
  const header = { alg: "RS256", typ: "JWT" };
  const claim = { iss: sa.client_email, scope: "https://www.googleapis.com/auth/spreadsheets.readonly", aud: tokenUri, iat: now, exp: now + 3600 };
  const enc = new TextEncoder();
  const signingInput = `${b64url(enc.encode(JSON.stringify(header)))}.${b64url(enc.encode(JSON.stringify(claim)))}`;
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(signingInput)));
  const jwt = `${signingInput}.${b64url(sig)}`;
  const res = await fetch(tokenUri, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}` });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}
function s(v) { return v === null || v === undefined ? "" : String(v).trim(); }
function mapGrade(v) { const n = parseInt(v, 10); return Number.isInteger(n) && n >= 1 && n <= 12 ? String(n) : null; }
function normPhone(v) {
  const d = String(v || "").replace(/\D/g, "");
  if (d.length === 10) return "1" + d;
  if (d.length === 11 && d[0] === "1") return d;
  return null;
}
async function fetchAll(supabase, table, select, eqCol, eqVal) {
  let out = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select(select).range(from, from + 999);
    if (eqCol) q = q.eq(eqCol, eqVal);
    const { data, error } = await q;
    if (error) throw new Error(`Load ${table} failed: ${error.message}`);
    out = out.concat(data ?? []);
    if (!data || data.length < 1000) break;
  }
  return out;
}

Deno.serve(async (req) => {
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(Deno.env.get("SUPABASE_URL"), SERVICE_KEY);
  const { data: cfg } = await supabase.from("sync_config").select("sync_token").eq("id", 1).single();
  const auth = req.headers.get("Authorization") || "";
  if (!cfg || auth !== `Bearer ${cfg.sync_token}`) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  let dryRun = false;
  try { dryRun = (await req.json())?.dryRun === true; } catch { /* no body */ }
  try {
    const sa = JSON.parse(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON"));
    const token = await getGoogleToken(sa);
    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties(title)`, { headers: { Authorization: `Bearer ${token}` } });
    if (!metaRes.ok) throw new Error(`Sheets metadata failed: ${metaRes.status} ${await metaRes.text()}`);
    const titles = ((await metaRes.json()).sheets ?? []).map((x) => x.properties.title);
    const title = titles.find((t) => t === TAB) ?? titles.find((t) => /lead_tracker/i.test(t) && /active/i.test(t));
    if (!title) throw new Error(`Tab not found. Available tabs: ${JSON.stringify(titles)}`);
    const range = encodeURIComponent(`${title}!A:Q`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?valueRenderOption=UNFORMATTED_VALUE`;
    const sheetRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!sheetRes.ok) throw new Error(`Sheets read failed for tab '${title}': ${sheetRes.status} ${await sheetRes.text()}`);
    const values = (await sheetRes.json()).values ?? [];
    if (values.length < 2) throw new Error("Sheet returned no data rows");
    const header = values[0].map((h) => s(h));
    const col = (name) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
    const cEmail = col("Parent/Guardian Email"), cFn = col("Parent/Guardian First Name"), cLn = col("Parent/Guardian Last Name"), cPhone = col("Parent/Guardian Phone Number"), cZip = col("ZipCode"), cGrade = col("Mapped 2027 grade"), cSrc = col("Lead Source"), cStudent = col("Student Name"), cTs = col("Timestamp");
    const rows = values.slice(1).filter((r) => r.some((x) => s(x) !== ""));
    const byEmail = new Map();
    let blankEmail = 0;
    for (const r of rows) {
      const email = s(r[cEmail]).toLowerCase();
      if (!email) { blankEmail++; continue; }
      if (!byEmail.has(email)) byEmail.set(email, []);
      byEmail.get(email).push(r);
    }
    // Family-level records (one per email) and the distinct grades per family.
    const records = [];
    const gradesByEmail = new Map();
    for (const [email, group] of byEmail) {
      const score = (r) => (s(r[cPhone]) ? 2 : 0) + (s(r[cZip]) ? 1 : 0);
      const sorted = [...group].sort((a, b) => (score(b) - score(a)) || (Number(b[cTs] || 0) - Number(a[cTs] || 0)));
      const best = sorted[0];
      const pick = (i) => { for (const r of sorted) { if (s(r[i])) return s(r[i]); } return ""; };
      let phone = null;
      for (const r of sorted) { const p = normPhone(r[cPhone]); if (p) { phone = p; break; } }
      records.push({ email, campus_id: CAMPUS_ID, first_name: s(best[cFn]), last_name: s(best[cLn]), phone, zip: pick(cZip) || null, entry_grade: mapGrade(s(best[cGrade])) ?? mapGrade(pick(cGrade)), source: /meta/i.test(pick(cSrc)) ? "ad" : "other", source_detail: pick(cSrc) || null, student_first_name: pick(cStudent) || null });
      const gs = new Set();
      for (const r of group) { const g = mapGrade(s(r[cGrade])); if (g) gs.add(g); }
      gradesByEmail.set(email, gs);
    }

    // ── Family (lead) reconciliation ──────────────────────────────────────
    const existing = await fetchAll(supabase, "lead", "id, email, first_name, last_name, phone, zip, entry_grade, source, source_detail, student_first_name", "campus_id", CAMPUS_ID);
    const existingByEmail = new Map(existing.map((l) => [String(l.email).toLowerCase(), l]));
    const toInsert = [], toUpdate = [];
    const fieldCounts = {};
    for (const rec of records) {
      const cur = existingByEmail.get(rec.email);
      if (!cur) { toInsert.push(rec); continue; }
      const upd = { id: cur.id };
      let changed = false;
      for (const f of SYNCED_FIELDS) { if ((cur[f] ?? null) !== (rec[f] ?? null)) { upd[f] = rec[f]; fieldCounts[f] = (fieldCounts[f] || 0) + 1; changed = true; } }
      if (rec.phone && rec.phone !== (cur.phone ?? null)) { upd.phone = rec.phone; fieldCounts.phone = (fieldCounts.phone || 0) + 1; changed = true; }
      if (changed) toUpdate.push(upd);
    }
    const sheetEmails = new Set(records.map((r) => r.email));
    const inAppNotInSheet = existing.filter((l) => !sheetEmails.has(String(l.email).toLowerCase())).length;

    if (!dryRun) {
      if (toInsert.length) {
        for (let i = 0; i < toInsert.length; i += 500) {
          const { error } = await supabase.from("lead").insert(toInsert.slice(i, i + 500));
          if (error) throw new Error(`Insert failed: ${error.message}`);
        }
      }
      for (const u of toUpdate) {
        const { id, ...fields } = u;
        const { error } = await supabase.from("lead").update(fields).eq("id", id);
        if (error) throw new Error(`Update ${id} failed: ${error.message}`);
      }
    }

    // ── Student (lead_student) reconciliation ─────────────────────────────
    // Re-read leads so newly-inserted families get an id for their students.
    const idRows = await fetchAll(supabase, "lead", "id, email", "campus_id", CAMPUS_ID);
    const idByEmail = new Map(idRows.map((l) => [String(l.email).toLowerCase(), l.id]));
    const leadIds = idRows.map((l) => l.id);
    const desired = new Set(); const desiredList = [];
    for (const [email, gs] of gradesByEmail) {
      const lid = idByEmail.get(email);
      if (!lid) continue; // family not yet in app (only possible in dryRun before insert)
      for (const g of gs) { const k = `${lid}|${g}`; if (!desired.has(k)) { desired.add(k); desiredList.push({ lead_id: lid, grade: g }); } }
    }
    // Fetch all lead_student rows (paginated) and keep this campus's — a
    // 1,000-id IN filter overflows the request URL.
    const leadIdSet = new Set(leadIds);
    const allStudents = await fetchAll(supabase, "lead_student", "id, lead_id, grade");
    const existingStudents = allStudents.filter((r) => leadIdSet.has(r.lead_id));
    const existingKeys = new Set(existingStudents.map((r) => `${r.lead_id}|${r.grade}`));
    const studentsToInsert = desiredList.filter((d) => !existingKeys.has(`${d.lead_id}|${d.grade}`));
    const studentsToDelete = existingStudents.filter((r) => !desired.has(`${r.lead_id}|${r.grade}`));

    if (!dryRun) {
      for (let i = 0; i < studentsToInsert.length; i += 500) {
        const { error } = await supabase.from("lead_student").insert(studentsToInsert.slice(i, i + 500));
        if (error) throw new Error(`Student insert failed: ${error.message}`);
      }
      const delIds = studentsToDelete.map((r) => r.id);
      for (let i = 0; i < delIds.length; i += 500) {
        const { error } = await supabase.from("lead_student").delete().in("id", delIds.slice(i, i + 500));
        if (error) throw new Error(`Student delete failed: ${error.message}`);
      }
    }

    const summary = {
      dryRun, tab: title,
      sheet_rows: rows.length,
      families_unique: records.length,
      families_in_app: existing.length,
      families_to_insert: toInsert.length,
      families_to_update: toUpdate.length,
      families_unchanged: records.length - toInsert.length - toUpdate.length,
      in_app_not_in_sheet: inAppNotInSheet,
      field_change_counts: fieldCounts,
      prospective_students: dryRun ? desiredList.length : (existingStudents.length - studentsToDelete.length + studentsToInsert.length),
      students_to_insert: studentsToInsert.length,
      students_to_delete: studentsToDelete.length,
      applied: !dryRun,
    };
    return new Response(JSON.stringify(summary, null, 2), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e instanceof Error ? e.message : e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
