#!/usr/bin/env node
/**
 * Seed script for Rooted EMS hosted Supabase.
 * Uses the service role key to bypass RLS.
 *
 * This script adapts to existing campus/org data in the database,
 * then inserts households, guardians, students, applications,
 * offers, acceptances, enrollment, and status history.
 *
 * Usage: node scripts/seed.mjs
 * Requires: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local
 */

import { createClient } from "../apps/web/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env from apps/web/.env.local
const envPath = resolve(__dirname, "../apps/web/.env.local");
const envContent = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const match = line.match(/^([A-Z_]+)=(.+)$/);
  if (match) env[match[1]] = match[2].trim();
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Helpers ─────────────────────────────────────────────

const now = new Date().toISOString();
const daysAgo = (d) => new Date(Date.now() - d * 86400000).toISOString();
const daysFromNow = (d) => new Date(Date.now() + d * 86400000).toISOString();

async function upsert(table, data) {
  const { error } = await supabase.from(table).upsert(data, { onConflict: "id" });
  if (error) {
    console.error(`  ✗ ${table}: ${error.message}`);
    return false;
  }
  const count = Array.isArray(data) ? data.length : 1;
  console.log(`  ✓ ${table}: ${count} row(s)`);
  return true;
}

async function insertIgnore(table, data) {
  const { error } = await supabase.from(table).insert(data);
  if (error && !error.message.includes("duplicate")) {
    console.error(`  ✗ ${table}: ${error.message}`);
    return false;
  }
  const count = Array.isArray(data) ? data.length : 1;
  console.log(`  ✓ ${table}: ${count} row(s)${error ? " (some already exist)" : ""}`);
  return true;
}

// ─── Main ─────────────────────────────────────────────────

async function seed() {
  console.log("🌱 Seeding Rooted EMS database...\n");
  console.log(`   URL: ${supabaseUrl}\n`);

  // ── Step 1: Discover existing org hierarchy ──
  console.log("🔍 Discovering existing database state...");

  const { data: campuses } = await supabase.from("campus").select("id, name, short_code, organization_id, region_id").order("short_code");
  if (!campuses || campuses.length === 0) {
    console.error("No campuses found in database. Please run supabase/seed.sql first via Supabase Dashboard SQL Editor.");
    process.exit(1);
  }

  console.log(`  Found ${campuses.length} campuses: ${campuses.map(c => c.short_code).join(", ")}`);

  // Map campuses by short_code for easy lookup
  const campusMap = {};
  for (const c of campuses) campusMap[c.short_code] = c;

  // Get Vancouver, Columbia, Cleveland campus IDs
  const VAN = campusMap["RSV"] || campusMap["VAN"] || campuses[0];
  const CRN = campusMap["CRN"] || campuses[1];
  const CLE = campusMap["RSC"] || campusMap["CLE"] || campuses[2];

  console.log(`  Vancouver: ${VAN.id} (${VAN.short_code})`);
  console.log(`  Columbia:  ${CRN.id} (${CRN.short_code})`);
  console.log(`  Cleveland: ${CLE.id} (${CLE.short_code})`);

  const ORG_ID = VAN.organization_id;

  // Get school year
  let { data: schoolYears } = await supabase.from("school_year").select("id, name, is_current").order("start_date");
  if (!schoolYears || schoolYears.length === 0) {
    console.log("  No school years found, creating...");
    const syData = [
      { id: "00000000-0000-0000-0003-000000000001", organization_id: ORG_ID, name: "2025-2026", start_date: "2025-08-15", end_date: "2026-06-15", is_current: true },
      { id: "00000000-0000-0000-0003-000000000002", organization_id: ORG_ID, name: "2026-2027", start_date: "2026-08-15", end_date: "2027-06-15", is_current: false },
    ];
    await upsert("school_year", syData);
    schoolYears = syData;
  }
  const SY = schoolYears.find(s => s.is_current) || schoolYears[0];
  console.log(`  School year: ${SY.name} (${SY.id})`);

  // Get or create grade levels
  let { data: gradeLevels } = await supabase.from("grade_level").select("id, campus_id, grade, school_year_id").eq("school_year_id", SY.id).order("grade");
  if (!gradeLevels || gradeLevels.length === 0) {
    console.log("  No grade levels found, creating...");
    const GRADES = ["6", "7", "8", "9", "10", "11", "12"];
    const glData = [];
    for (const campus of [VAN, CRN, CLE]) {
      for (let gi = 0; gi < GRADES.length; gi++) {
        glData.push({
          id: `00000000-0000-0000-0004-${campus.id.slice(-4)}${String(gi + 1).padStart(8, "0")}`,
          campus_id: campus.id,
          school_year_id: SY.id,
          grade: GRADES[gi],
        });
      }
    }
    await upsert("grade_level", glData);
    gradeLevels = glData;
  }
  console.log(`  Grade levels: ${gradeLevels.length}`);

  // Build grade lookup: (campusId, grade) → gradeLevelId
  function getGradeId(campusId, grade) {
    const gl = gradeLevels.find(g => g.campus_id === campusId && g.grade === grade);
    if (!gl) throw new Error(`Grade level not found: campus=${campusId}, grade=${grade}`);
    return gl.id;
  }

  // Get or create enrollment windows
  let { data: windows } = await supabase.from("enrollment_window").select("id, campus_id, name, status").eq("school_year_id", SY.id);
  if (!windows || windows.length === 0) {
    console.log("  No enrollment windows found, creating...");
    const ewData = [
      { id: "00000000-0000-0000-0005-000000000001", campus_id: VAN.id, school_year_id: SY.id, name: "Vancouver 2025-26 Open Enrollment", status: "open", open_date: "2025-12-01T00:00:00Z", close_date: "2026-04-30T23:59:59Z", description: "Open enrollment for Rooted School Vancouver" },
      { id: "00000000-0000-0000-0005-000000000002", campus_id: CRN.id, school_year_id: SY.id, name: "C.R. Neal 2025-26 Open Enrollment", status: "open", open_date: "2025-12-01T00:00:00Z", close_date: "2026-04-30T23:59:59Z", description: "Open enrollment for C.R. Neal Academy" },
      { id: "00000000-0000-0000-0005-000000000003", campus_id: CLE.id, school_year_id: SY.id, name: "Cleveland 2025-26 Open Enrollment", status: "open", open_date: "2025-12-01T00:00:00Z", close_date: "2026-04-30T23:59:59Z", description: "Open enrollment for Rooted School Cleveland" },
    ];
    await upsert("enrollment_window", ewData);
    windows = ewData;
  }
  console.log(`  Enrollment windows: ${windows.length}`);

  // Map campus_id → window_id
  function getWindowId(campusId) {
    const w = windows.find(w => w.campus_id === campusId);
    if (!w) throw new Error(`No enrollment window for campus ${campusId}`);
    return w.id;
  }

  // ── Step 2: Ensure capacity plans exist ──
  console.log("\n📅 Capacity plans");
  let { data: existingCaps } = await supabase.from("capacity_plan").select("id").eq("school_year_id", SY.id).limit(1);
  if (!existingCaps || existingCaps.length === 0) {
    const capData = [];
    const seatsMap = { [VAN.id]: 30, [CRN.id]: 25, [CLE.id]: 25 };
    for (const campus of [VAN, CRN, CLE]) {
      for (const gl of gradeLevels.filter(g => g.campus_id === campus.id)) {
        capData.push({
          campus_id: campus.id,
          grade_level_id: gl.id,
          school_year_id: SY.id,
          total_seats: seatsMap[campus.id],
          seats_offered: 0,
          seats_accepted: 0,
          seats_registered: 0,
        });
      }
    }
    await upsert("capacity_plan", capData);
  } else {
    console.log("  ✓ capacity_plan: already populated");
  }

  // Ensure lottery rule sets exist
  let { data: existingLrs } = await supabase.from("lottery_rule_set").select("id").limit(1);
  if (!existingLrs || existingLrs.length === 0) {
    const lrsData = [VAN, CRN, CLE].map((c, i) => ({
      id: `00000000-0000-0000-0007-00000000000${i + 1}`,
      campus_id: c.id,
      name: `${c.name} Standard Lottery Rules`,
      sibling_preference: true,
      geographic_preference: false,
      priority_tiers: JSON.stringify(["Siblings of current students", "In-district residents", "Out-of-district residents"]),
      rules: JSON.stringify({}),
      is_active: true,
    }));
    await upsert("lottery_rule_set", lrsData);
  } else {
    console.log("  ✓ lottery_rule_set: already populated");
  }

  // ── Step 3: Clean up old seed data (application-level) ──
  console.log("\n🧹 Cleaning old application-level seed data...");
  // Delete in dependency order
  await supabase.from("application_status_history").delete().neq("id", "00000000-ffff-ffff-ffff-ffffffffffff");
  await supabase.from("enrollment").delete().neq("id", "00000000-ffff-ffff-ffff-ffffffffffff");
  await supabase.from("acceptance").delete().neq("id", "00000000-ffff-ffff-ffff-ffffffffffff");
  await supabase.from("offer").delete().neq("id", "00000000-ffff-ffff-ffff-ffffffffffff");
  await supabase.from("application").delete().neq("id", "00000000-ffff-ffff-ffff-ffffffffffff");
  // Clean old document refs
  await supabase.from("document").delete().neq("id", "00000000-ffff-ffff-ffff-ffffffffffff");
  await supabase.from("guardian_student").delete().neq("guardian_id", "00000000-ffff-ffff-ffff-ffffffffffff");
  await supabase.from("student").delete().neq("id", "00000000-ffff-ffff-ffff-ffffffffffff");
  await supabase.from("guardian").delete().neq("id", "00000000-ffff-ffff-ffff-ffffffffffff");
  await supabase.from("household").delete().neq("id", "00000000-ffff-ffff-ffff-ffffffffffff");
  console.log("  ✓ Old data cleaned");

  // ── Step 4: Seed people ──
  console.log("\n👨‍👩‍👧‍👦 People");
  const HOUSEHOLDS = [
    { id: "00000000-0000-0000-0010-000000000001", address_line1: "123 Maple Ave", city: "Vancouver", state: "WA", zip: "98661" },
    { id: "00000000-0000-0000-0010-000000000002", address_line1: "456 Oak St", city: "Vancouver", state: "WA", zip: "98662" },
    { id: "00000000-0000-0000-0010-000000000003", address_line1: "789 Pine Rd", city: "Vancouver", state: "WA", zip: "98663" },
    { id: "00000000-0000-0000-0010-000000000004", address_line1: "321 Elm Dr", city: "Columbia", state: "SC", zip: "29201" },
    { id: "00000000-0000-0000-0010-000000000005", address_line1: "654 Birch Ln", city: "Columbia", state: "SC", zip: "29203" },
    { id: "00000000-0000-0000-0010-000000000006", address_line1: "987 Cedar Ct", city: "Columbia", state: "SC", zip: "29205" },
    { id: "00000000-0000-0000-0010-000000000007", address_line1: "147 Spruce Way", city: "Cleveland", state: "OH", zip: "44114" },
    { id: "00000000-0000-0000-0010-000000000008", address_line1: "258 Willow Blvd", city: "Cleveland", state: "OH", zip: "44115" },
    { id: "00000000-0000-0000-0010-000000000009", address_line1: "369 Ash Pl", city: "Cleveland", state: "OH", zip: "44118" },
    { id: "00000000-0000-0000-0010-000000000010", address_line1: "100 Walnut Ave", city: "Vancouver", state: "WA", zip: "98664" },
    { id: "00000000-0000-0000-0010-000000000011", address_line1: "200 Cherry St", city: "Columbia", state: "SC", zip: "29206" },
    { id: "00000000-0000-0000-0010-000000000012", address_line1: "300 Poplar Dr", city: "Cleveland", state: "OH", zip: "44120" },
  ];
  await upsert("household", HOUSEHOLDS);

  const GUARDIANS = [
    { id: "00000000-0000-0000-0011-000000000001", household_id: HOUSEHOLDS[0].id, first_name: "Maria", last_name: "Garcia", relationship: "mother", email: "maria.garcia@example.com", phone: "(360) 555-1001", sms_consent: true },
    { id: "00000000-0000-0000-0011-000000000002", household_id: HOUSEHOLDS[1].id, first_name: "James", last_name: "Williams", relationship: "father", email: "james.williams@example.com", phone: "(360) 555-1002", sms_consent: true },
    { id: "00000000-0000-0000-0011-000000000003", household_id: HOUSEHOLDS[2].id, first_name: "Sarah", last_name: "Johnson", relationship: "mother", email: "sarah.johnson@example.com", phone: "(360) 555-1003", sms_consent: false },
    { id: "00000000-0000-0000-0011-000000000004", household_id: HOUSEHOLDS[3].id, first_name: "Michael", last_name: "Brown", relationship: "father", email: "michael.brown@example.com", phone: "(803) 555-2001", sms_consent: true },
    { id: "00000000-0000-0000-0011-000000000005", household_id: HOUSEHOLDS[4].id, first_name: "Jennifer", last_name: "Davis", relationship: "mother", email: "jennifer.davis@example.com", phone: "(803) 555-2002", sms_consent: true },
    { id: "00000000-0000-0000-0011-000000000006", household_id: HOUSEHOLDS[5].id, first_name: "David", last_name: "Martinez", relationship: "father", email: "david.martinez@example.com", phone: "(803) 555-2003", sms_consent: false },
    { id: "00000000-0000-0000-0011-000000000007", household_id: HOUSEHOLDS[6].id, first_name: "Lisa", last_name: "Anderson", relationship: "mother", email: "lisa.anderson@example.com", phone: "(216) 555-3001", sms_consent: true },
    { id: "00000000-0000-0000-0011-000000000008", household_id: HOUSEHOLDS[7].id, first_name: "Robert", last_name: "Taylor", relationship: "father", email: "robert.taylor@example.com", phone: "(216) 555-3002", sms_consent: true },
    { id: "00000000-0000-0000-0011-000000000009", household_id: HOUSEHOLDS[8].id, first_name: "Amanda", last_name: "Thomas", relationship: "mother", email: "amanda.thomas@example.com", phone: "(216) 555-3003", sms_consent: false },
    { id: "00000000-0000-0000-0011-000000000010", household_id: HOUSEHOLDS[9].id, first_name: "Patricia", last_name: "Wilson", relationship: "mother", email: "patricia.wilson@example.com", phone: "(360) 555-1004", sms_consent: true },
    { id: "00000000-0000-0000-0011-000000000011", household_id: HOUSEHOLDS[10].id, first_name: "Carlos", last_name: "Lopez", relationship: "father", email: "carlos.lopez@example.com", phone: "(803) 555-2004", sms_consent: true },
    { id: "00000000-0000-0000-0011-000000000012", household_id: HOUSEHOLDS[11].id, first_name: "Karen", last_name: "White", relationship: "mother", email: "karen.white@example.com", phone: "(216) 555-3004", sms_consent: true },
  ];
  await upsert("guardian", GUARDIANS);

  // race_ethnicity is TEXT[] array
  const STUDENTS = [
    { id: "00000000-0000-0000-0012-000000000001", household_id: HOUSEHOLDS[0].id, first_name: "Sofia", last_name: "Garcia", date_of_birth: "2013-03-15", gender: "female", race_ethnicity: ["Hispanic/Latino"], primary_language: "English", home_language: "Spanish" },
    { id: "00000000-0000-0000-0012-000000000002", household_id: HOUSEHOLDS[1].id, first_name: "Ethan", last_name: "Williams", date_of_birth: "2012-07-22", gender: "male", race_ethnicity: ["White"], primary_language: "English", home_language: "English" },
    { id: "00000000-0000-0000-0012-000000000003", household_id: HOUSEHOLDS[2].id, first_name: "Olivia", last_name: "Johnson", date_of_birth: "2013-01-10", gender: "female", race_ethnicity: ["Black/African American"], primary_language: "English", home_language: "English" },
    { id: "00000000-0000-0000-0012-000000000004", household_id: HOUSEHOLDS[3].id, first_name: "Liam", last_name: "Brown", date_of_birth: "2013-05-20", gender: "male", race_ethnicity: ["White"], primary_language: "English", home_language: "English" },
    { id: "00000000-0000-0000-0012-000000000005", household_id: HOUSEHOLDS[4].id, first_name: "Emma", last_name: "Davis", date_of_birth: "2012-11-08", gender: "female", race_ethnicity: ["Black/African American"], primary_language: "English", home_language: "English" },
    { id: "00000000-0000-0000-0012-000000000006", household_id: HOUSEHOLDS[5].id, first_name: "Lucas", last_name: "Martinez", date_of_birth: "2013-08-30", gender: "male", race_ethnicity: ["Hispanic/Latino"], primary_language: "English", home_language: "Spanish" },
    { id: "00000000-0000-0000-0012-000000000007", household_id: HOUSEHOLDS[6].id, first_name: "Ava", last_name: "Anderson", date_of_birth: "2012-12-03", gender: "female", race_ethnicity: ["White"], primary_language: "English", home_language: "English" },
    { id: "00000000-0000-0000-0012-000000000008", household_id: HOUSEHOLDS[7].id, first_name: "Mason", last_name: "Taylor", date_of_birth: "2013-04-18", gender: "male", race_ethnicity: ["Black/African American"], primary_language: "English", home_language: "English" },
    { id: "00000000-0000-0000-0012-000000000009", household_id: HOUSEHOLDS[8].id, first_name: "Mia", last_name: "Thomas", date_of_birth: "2012-06-25", gender: "female", race_ethnicity: ["Multi-Racial"], primary_language: "English", home_language: "English" },
    { id: "00000000-0000-0000-0012-000000000010", household_id: HOUSEHOLDS[9].id, first_name: "Noah", last_name: "Wilson", date_of_birth: "2012-09-05", gender: "male", race_ethnicity: ["Asian"], primary_language: "English", home_language: "Vietnamese" },
    { id: "00000000-0000-0000-0012-000000000011", household_id: HOUSEHOLDS[10].id, first_name: "Isabella", last_name: "Lopez", date_of_birth: "2013-02-14", gender: "female", race_ethnicity: ["Hispanic/Latino"], primary_language: "Spanish", home_language: "Spanish" },
    { id: "00000000-0000-0000-0012-000000000012", household_id: HOUSEHOLDS[11].id, first_name: "Elijah", last_name: "White", date_of_birth: "2012-10-12", gender: "male", race_ethnicity: ["White"], primary_language: "English", home_language: "English" },
  ];
  await upsert("student", STUDENTS);

  // guardian_student junction — includes relationship enum
  const GUARDIAN_STUDENT = GUARDIANS.map((g, i) => ({
    guardian_id: g.id,
    student_id: STUDENTS[i].id,
    relationship: g.relationship,
    is_legal_guardian: true,
  }));
  await insertIgnore("guardian_student", GUARDIAN_STUDENT);

  // ── Step 5: Applications ──
  console.log("\n📋 Applications");
  const APPLICATIONS = [
    // Vancouver
    { id: "00000000-0000-0000-0020-000000000001", enrollment_window_id: getWindowId(VAN.id), student_id: STUDENTS[0].id, guardian_id: GUARDIANS[0].id, campus_id: VAN.id, grade_level_id: getGradeId(VAN.id, "6"), status: "submitted" },
    { id: "00000000-0000-0000-0020-000000000002", enrollment_window_id: getWindowId(VAN.id), student_id: STUDENTS[1].id, guardian_id: GUARDIANS[1].id, campus_id: VAN.id, grade_level_id: getGradeId(VAN.id, "7"), status: "verified" },
    { id: "00000000-0000-0000-0020-000000000003", enrollment_window_id: getWindowId(VAN.id), student_id: STUDENTS[2].id, guardian_id: GUARDIANS[2].id, campus_id: VAN.id, grade_level_id: getGradeId(VAN.id, "6"), status: "needs_info" },
    { id: "00000000-0000-0000-0020-000000000010", enrollment_window_id: getWindowId(VAN.id), student_id: STUDENTS[9].id, guardian_id: GUARDIANS[9].id, campus_id: VAN.id, grade_level_id: getGradeId(VAN.id, "8"), status: "offered" },
    // Columbia
    { id: "00000000-0000-0000-0020-000000000004", enrollment_window_id: getWindowId(CRN.id), student_id: STUDENTS[3].id, guardian_id: GUARDIANS[3].id, campus_id: CRN.id, grade_level_id: getGradeId(CRN.id, "6"), status: "verified" },
    { id: "00000000-0000-0000-0020-000000000005", enrollment_window_id: getWindowId(CRN.id), student_id: STUDENTS[4].id, guardian_id: GUARDIANS[4].id, campus_id: CRN.id, grade_level_id: getGradeId(CRN.id, "7"), status: "submitted" },
    { id: "00000000-0000-0000-0020-000000000006", enrollment_window_id: getWindowId(CRN.id), student_id: STUDENTS[5].id, guardian_id: GUARDIANS[5].id, campus_id: CRN.id, grade_level_id: getGradeId(CRN.id, "6"), status: "accepted" },
    { id: "00000000-0000-0000-0020-000000000011", enrollment_window_id: getWindowId(CRN.id), student_id: STUDENTS[10].id, guardian_id: GUARDIANS[10].id, campus_id: CRN.id, grade_level_id: getGradeId(CRN.id, "8"), status: "registered" },
    // Cleveland
    { id: "00000000-0000-0000-0020-000000000007", enrollment_window_id: getWindowId(CLE.id), student_id: STUDENTS[6].id, guardian_id: GUARDIANS[6].id, campus_id: CLE.id, grade_level_id: getGradeId(CLE.id, "6"), status: "submitted" },
    { id: "00000000-0000-0000-0020-000000000008", enrollment_window_id: getWindowId(CLE.id), student_id: STUDENTS[7].id, guardian_id: GUARDIANS[7].id, campus_id: CLE.id, grade_level_id: getGradeId(CLE.id, "7"), status: "verified" },
    { id: "00000000-0000-0000-0020-000000000009", enrollment_window_id: getWindowId(CLE.id), student_id: STUDENTS[8].id, guardian_id: GUARDIANS[8].id, campus_id: CLE.id, grade_level_id: getGradeId(CLE.id, "8"), status: "offered" },
    { id: "00000000-0000-0000-0020-000000000012", enrollment_window_id: getWindowId(CLE.id), student_id: STUDENTS[11].id, guardian_id: GUARDIANS[11].id, campus_id: CLE.id, grade_level_id: getGradeId(CLE.id, "6"), status: "draft" },
  ];
  await upsert("application", APPLICATIONS);

  // ── Step 6: Offers, Acceptances, Enrollment ──
  console.log("\n🎫 Offers & Enrollment");
  const OFFERS = [
    { id: "00000000-0000-0000-0030-000000000001", application_id: APPLICATIONS[3].id, campus_id: VAN.id, grade_level_id: getGradeId(VAN.id, "8"), status: "pending", offered_at: daysAgo(5), expires_at: daysFromNow(9) },
    { id: "00000000-0000-0000-0030-000000000002", application_id: APPLICATIONS[6].id, campus_id: CRN.id, grade_level_id: getGradeId(CRN.id, "6"), status: "accepted", offered_at: daysAgo(14), expires_at: daysAgo(0) },
    { id: "00000000-0000-0000-0030-000000000003", application_id: APPLICATIONS[10].id, campus_id: CLE.id, grade_level_id: getGradeId(CLE.id, "8"), status: "pending", offered_at: daysAgo(3), expires_at: daysFromNow(11) },
    { id: "00000000-0000-0000-0030-000000000004", application_id: APPLICATIONS[7].id, campus_id: CRN.id, grade_level_id: getGradeId(CRN.id, "8"), status: "accepted", offered_at: daysAgo(30), expires_at: daysAgo(16) },
  ];
  await upsert("offer", OFFERS);

  // acceptance: accepted_by (not guardian_id), application_id required
  const ACCEPTANCES = [
    { id: "00000000-0000-0000-0031-000000000001", offer_id: OFFERS[1].id, application_id: APPLICATIONS[6].id, accepted_by: GUARDIANS[5].id, accepted_at: daysAgo(10) },
    { id: "00000000-0000-0000-0031-000000000002", offer_id: OFFERS[3].id, application_id: APPLICATIONS[7].id, accepted_by: GUARDIANS[10].id, accepted_at: daysAgo(25) },
  ];
  await upsert("acceptance", ACCEPTANCES);

  const ENROLLMENTS = [
    {
      id: "00000000-0000-0000-0032-000000000001",
      student_id: STUDENTS[10].id, campus_id: CRN.id,
      grade_level_id: getGradeId(CRN.id, "8"), school_year_id: SY.id,
      application_id: APPLICATIONS[7].id, acceptance_id: ACCEPTANCES[1].id,
      status: "active", enrolled_at: daysAgo(20),
    },
  ];
  await upsert("enrollment", ENROLLMENTS);

  // ── Step 7: Update capacity counts ──
  console.log("\n📊 Updating capacity counts");
  // Find capacity plans by campus + grade to update counts
  async function updateCap(campusId, grade, updates) {
    const glId = getGradeId(campusId, grade);
    const { error } = await supabase.from("capacity_plan").update(updates).eq("grade_level_id", glId).eq("school_year_id", SY.id);
    if (error) console.error(`  ✗ capacity update: ${error.message}`);
  }
  await updateCap(VAN.id, "8", { seats_offered: 1 });
  await updateCap(CRN.id, "6", { seats_offered: 1, seats_accepted: 1 });
  await updateCap(CLE.id, "8", { seats_offered: 1 });
  await updateCap(CRN.id, "8", { seats_offered: 1, seats_accepted: 1, seats_registered: 1 });
  console.log("  ✓ capacity_plan: 4 rows updated");

  // ── Step 8: Status history ──
  console.log("\n📜 Application status history");
  // from_status / to_status columns, changed_by is nullable UUID
  const histories = [
    { application_id: APPLICATIONS[0].id, from_status: "draft", to_status: "submitted" },
    { application_id: APPLICATIONS[1].id, from_status: "draft", to_status: "submitted" },
    { application_id: APPLICATIONS[1].id, from_status: "submitted", to_status: "verified" },
    { application_id: APPLICATIONS[2].id, from_status: "draft", to_status: "submitted" },
    { application_id: APPLICATIONS[2].id, from_status: "submitted", to_status: "needs_info" },
    { application_id: APPLICATIONS[3].id, from_status: "draft", to_status: "submitted" },
    { application_id: APPLICATIONS[3].id, from_status: "submitted", to_status: "verified" },
    { application_id: APPLICATIONS[3].id, from_status: "verified", to_status: "offered" },
    { application_id: APPLICATIONS[4].id, from_status: "draft", to_status: "submitted" },
    { application_id: APPLICATIONS[4].id, from_status: "submitted", to_status: "verified" },
    { application_id: APPLICATIONS[5].id, from_status: "draft", to_status: "submitted" },
    { application_id: APPLICATIONS[6].id, from_status: "draft", to_status: "submitted" },
    { application_id: APPLICATIONS[6].id, from_status: "submitted", to_status: "verified" },
    { application_id: APPLICATIONS[6].id, from_status: "verified", to_status: "offered" },
    { application_id: APPLICATIONS[6].id, from_status: "offered", to_status: "accepted" },
    { application_id: APPLICATIONS[7].id, from_status: "draft", to_status: "submitted" },
    { application_id: APPLICATIONS[7].id, from_status: "submitted", to_status: "verified" },
    { application_id: APPLICATIONS[7].id, from_status: "verified", to_status: "offered" },
    { application_id: APPLICATIONS[7].id, from_status: "offered", to_status: "accepted" },
    { application_id: APPLICATIONS[7].id, from_status: "accepted", to_status: "registered" },
    { application_id: APPLICATIONS[8].id, from_status: "draft", to_status: "submitted" },
    { application_id: APPLICATIONS[9].id, from_status: "draft", to_status: "submitted" },
    { application_id: APPLICATIONS[9].id, from_status: "submitted", to_status: "verified" },
    { application_id: APPLICATIONS[10].id, from_status: "draft", to_status: "submitted" },
    { application_id: APPLICATIONS[10].id, from_status: "submitted", to_status: "verified" },
    { application_id: APPLICATIONS[10].id, from_status: "verified", to_status: "offered" },
  ];
  await insertIgnore("application_status_history", histories);

  console.log("\n✅ Seed complete!\n");
  console.log("Next steps:");
  console.log("  1. Log in via Google OAuth at /staff-login");
  console.log("  2. Find your user ID in Supabase Dashboard → Auth → Users");
  console.log("  3. Run supabase/seed-staff-roles.sql in the SQL Editor");
  console.log("     (replace the placeholder UUID with your real user ID)");
}

seed().catch(console.error);
