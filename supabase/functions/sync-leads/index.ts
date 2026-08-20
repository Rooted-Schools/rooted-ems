// Weekly (and on-demand) sync of the C.R. Neal lead tracker.
//
// Source of truth: the "[Active].Lead_Tracker" tab of the Google Sheet titled
// [Source of Truth].CR_Neal_Academy.Lead_Tracker. This function reads that tab
// with a read-only service account, collapses it to ONE record per email (the
// tab carries deliberate duplicate rows that must NOT become duplicate leads),
// maps the fields the app expects, and upserts into `lead` for C.R. Neal.
//
// It never deletes and never inserts a duplicate. Operational columns (stage,
// assigned_to, application_id, converted_at) are never touched. Phone is
// backfill-only: a good existing number is never overwritten with the sheet's
// blanks or junk, and only real 10/11-digit numbers are stored.
//
// Auth: the Authorization Bearer must equal the token in the locked
// sync_config table (verify_jwt is off because this IS the auth). Pass
// {"dryRun": true} to compute the diff without writing.

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
    const records = [];
    for (const [email, group] of byEmail) {
      const score = (r) => (s(r[cPhone]) ? 2 : 0) + (s(r[cZip]) ? 1 : 0);
      const sorted = [...group].sort((a, b) => (score(b) - score(a)) || (Number(b[cTs] || 0) - Number(a[cTs] || 0)));
      const best = sorted[0];
      const pick = (i) => { for (const r of sorted) { if (s(r[i])) return s(r[i]); } return ""; };
      let phone = null;
      for (const r of sorted) { const p = normPhone(r[cPhone]); if (p) { phone = p; break; } }
      records.push({ email, campus_id: CAMPUS_ID, first_name: s(best[cFn]), last_name: s(best[cLn]), phone, zip: pick(cZip) || null, entry_grade: mapGrade(s(best[cGrade])) ?? mapGrade(pick(cGrade)), source: /meta/i.test(pick(cSrc)) ? "ad" : "other", source_detail: pick(cSrc) || null, student_first_name: pick(cStudent) || null });
    }
    let existing = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("lead").select("id, email, first_name, last_name, phone, zip, entry_grade, source, source_detail, student_first_name").eq("campus_id", CAMPUS_ID).range(from, from + 999);
      if (error) throw new Error(`Load existing leads failed: ${error.message}`);
      existing = existing.concat(data ?? []);
      if (!data || data.length < 1000) break;
    }
    const existingByEmail = new Map(existing.map((l) => [String(l.email).toLowerCase(), l]));
    const toInsert = [], toUpdate = [];
    const fieldCounts = {}; const sample = [];
    for (const rec of records) {
      const cur = existingByEmail.get(rec.email);
      if (!cur) { toInsert.push(rec); continue; }
      const upd = { id: cur.id };
      const diff = {};
      for (const f of SYNCED_FIELDS) { if ((cur[f] ?? null) !== (rec[f] ?? null)) { diff[f] = [cur[f] ?? null, rec[f] ?? null]; upd[f] = rec[f]; fieldCounts[f] = (fieldCounts[f] || 0) + 1; } }
      if (rec.phone && rec.phone !== (cur.phone ?? null)) { diff.phone = [cur.phone ?? null, rec.phone]; upd.phone = rec.phone; fieldCounts.phone = (fieldCounts.phone || 0) + 1; }
      if (Object.keys(diff).length) { toUpdate.push(upd); if (sample.length < 15) sample.push({ email: rec.email, diff }); }
    }
    const sheetEmails = new Set(records.map((r) => r.email));
    const inAppNotInSheet = existing.filter((l) => !sheetEmails.has(String(l.email).toLowerCase())).length;
    const summary = { dryRun, tab: title, sheet_rows: rows.length, unique_emails: records.length, blank_email_rows: blankEmail, already_in_app: existing.length, to_insert: toInsert.length, to_update: toUpdate.length, unchanged: records.length - toInsert.length - toUpdate.length, in_app_not_in_sheet: inAppNotInSheet, field_change_counts: fieldCounts };
    if (dryRun) return new Response(JSON.stringify({ ...summary, sample }, null, 2), { headers: { "Content-Type": "application/json" } });
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
    return new Response(JSON.stringify({ ...summary, applied: true }, null, 2), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e instanceof Error ? e.message : e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
