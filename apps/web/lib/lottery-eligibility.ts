/**
 * Turning applications into draw entries: who is a sibling, who is linked to
 * whom, and which weighted tiers each applicant actually matched.
 *
 * This file is where policy meets the data model, so it is the file most
 * likely to lie if written carelessly. Two rules hold throughout:
 *
 *   - A relationship is either evidenced in the data or it is not claimed. A
 *     family ticking "my child has a sibling at this school" is a CLAIM; an
 *     active enrollment record for a student sharing a legal guardian is
 *     EVIDENCE. Only evidence earns the absolute preference. Claims that could
 *     not be verified are counted and surfaced, never quietly honored and
 *     never quietly dropped.
 *
 *   - A weighted tier whose declared source field is not collected anywhere in
 *     this system reports as UNSOURCED, not as "zero applicants matched".
 *     Those are different facts and only one of them is true.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * HOW "SIBLING OF A CURRENTLY ENROLLED STUDENT" IS DERIVED
 *
 * The RSV Board Enrollment Policy (adopted 2023-01-25, revised 2024-08-20)
 * defines a sibling as sharing a legal parent or guardian, and excludes foster
 * placements until legal guardianship is established. The schema expresses
 * exactly that:
 *
 *   application.student_id
 *     -> guardian_student (student_id, guardian_id, is_legal_guardian = true)
 *          [supabase/migrations/00003_people.sql:97-105]
 *     -> the same guardian's OTHER students, again via guardian_student with
 *        is_legal_guardian = true
 *     -> enrollment (student_id, campus_id = this run's campus,
 *        status = 'active', school_year_id in the current school years)
 *          [supabase/migrations/00007_capacity_enrollment.sql:22-38]
 *
 * guardian_student.is_legal_guardian is written true by both application
 * creation paths (lib/mutations/applications.ts:313-320 and :845-851), so the
 * linkage exists for every application this system created. The foster
 * exclusion falls out of the same flag: a foster placement without legal
 * guardianship is not is_legal_guardian = true.
 *
 * A policy may instead declare siblingDefinition "shared_household", in which
 * case the linkage runs through student.household_id. That is a looser rule
 * and is not what RSV adopted.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type {
  LotteryPolicyAbsolutePreference,
  LotteryPolicyWeightedTier,
} from "@/lib/lottery-policy";
import {
  POLICY_COLLECTED_ANSWER_KEYS,
  POLICY_MATCHABLE_APPLICATION_COLUMNS,
} from "@/lib/lottery-policy";

/** Minimal shape of the Supabase client these helpers need. */
type QueryClient = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

// ─── Sibling of a currently enrolled student ───────────────────────────────

export interface SiblingDerivation {
  /** application.ids with EVIDENCE of a sibling currently enrolled here. */
  qualified: Set<string>;
  /** application.ids that CLAIMED a sibling but produced no matching record. */
  claimedUnverified: Set<string>;
  /**
   * True when the guardian linkage could not be read at all — no
   * guardian_student rows exist for any applicant. The preference cannot be
   * applied and the run must not pretend it was.
   */
  linkageUnresolvable: boolean;
  /** application.id -> student.id, reused by the linked-sibling pass. */
  studentByApplication: Map<string, string>;
  /** application.id -> legal guardian ids, reused by the linked-sibling pass. */
  guardiansByApplication: Map<string, string[]>;
  /** Plain-English description of what was checked, for the preview and report. */
  method: string;
}

export async function deriveSiblingOfEnrolled(
  supabase: QueryClient,
  applicationIds: string[],
  campusId: string,
  preference: LotteryPolicyAbsolutePreference | null,
  /**
   * True when the policy pulls co-applying siblings in behind a drawn
   * applicant. That rule needs the guardian map even when the absolute sibling
   * preference is off, so the early return below must not skip building it.
   */
  linkedSiblingActivation = false
): Promise<SiblingDerivation> {
  const empty: SiblingDerivation = {
    qualified: new Set(),
    claimedUnverified: new Set(),
    linkageUnresolvable: false,
    studentByApplication: new Map(),
    guardiansByApplication: new Map(),
    method: "Sibling preference is not enabled in the governing policy.",
  };

  if (applicationIds.length === 0) return empty;

  // Applicant students, plus the self-declared sibling claim on the
  // application row. The claim is used only to report unverified claims.
  const { data: apps } = await supabase
    .from("application")
    .select("id, student_id, has_sibling_enrolled")
    .in("id", applicationIds);

  const studentByApplication = new Map<string, string>();
  const claimed = new Set<string>();
  for (const row of (apps ?? []) as Array<Record<string, unknown>>) {
    studentByApplication.set(row.id as string, row.student_id as string);
    if (row.has_sibling_enrolled === true) claimed.add(row.id as string);
  }

  // The family form records its sibling answer in the EAV table rather than on
  // the application row (lib/mutations/applications.ts writes the allowlisted
  // key has_sibling_at_school). Read it so a family claim is not invisible.
  // NOTE: the columns are field_key / value — application_answer has no
  // question_key or answer_value column (00004_applications.sql:58-66).
  const { data: answers } = await supabase
    .from("application_answer")
    .select("application_id, value")
    .in("application_id", applicationIds)
    .eq("field_key", "has_sibling_at_school");

  for (const row of (answers ?? []) as Array<Record<string, unknown>>) {
    if (isAffirmative(row.value)) claimed.add(row.application_id as string);
  }

  const guardiansByApplication = new Map<string, string[]>();
  const preferenceEnabled = !!preference?.enabled;

  // The guardian map is what linked-sibling activation runs on. Returning here
  // whenever the absolute sibling preference is off left that map empty, which
  // silently switched off a rule the policy had turned ON — co-applying
  // siblings were never pulled in together and nothing said so.
  if (!preferenceEnabled && !linkedSiblingActivation) {
    return { ...empty, studentByApplication, claimedUnverified: new Set(), guardiansByApplication };
  }

  const studentIds = [...new Set([...studentByApplication.values()])].filter(Boolean);
  if (studentIds.length === 0) {
    return {
      qualified: new Set(),
      claimedUnverified: claimed,
      linkageUnresolvable: true,
      studentByApplication,
      guardiansByApplication,
      method: "No applicant student records could be read, so sibling linkage could not be checked.",
    };
  }

  const bySharedHousehold = preference?.siblingDefinition === "shared_household";

  // ── Applicant student -> the people they are linked to ───────────────────
  const linkKeyByStudent = new Map<string, string[]>();

  if (bySharedHousehold) {
    const { data: students } = await supabase
      .from("student")
      .select("id, household_id")
      .in("id", studentIds);
    for (const row of (students ?? []) as Array<Record<string, unknown>>) {
      const household = row.household_id as string | null;
      if (household) linkKeyByStudent.set(row.id as string, [household]);
    }
  } else {
    const { data: links } = await supabase
      .from("guardian_student")
      .select("student_id, guardian_id")
      .in("student_id", studentIds)
      .eq("is_legal_guardian", true);
    for (const row of (links ?? []) as Array<Record<string, unknown>>) {
      const studentId = row.student_id as string;
      const list = linkKeyByStudent.get(studentId) ?? [];
      list.push(row.guardian_id as string);
      linkKeyByStudent.set(studentId, list);
    }
  }

  for (const [applicationId, studentId] of studentByApplication.entries()) {
    guardiansByApplication.set(applicationId, linkKeyByStudent.get(studentId) ?? []);
  }

  const method = bySharedHousehold
    ? "A sibling shares a household with the applicant, and is actively enrolled at this campus in a current school year."
    : "A sibling shares a legal parent or guardian with the applicant (guardian_student.is_legal_guardian), and is actively enrolled at this campus in a current school year.";

  // Linked-sibling activation only needs the map built above. Stop here when
  // the absolute preference is off: nothing qualifies for it, and saying so is
  // different from saying the linkage could not be read.
  if (!preferenceEnabled) {
    return {
      qualified: new Set(),
      claimedUnverified: new Set(),
      linkageUnresolvable: false,
      studentByApplication,
      guardiansByApplication,
      method:
        "The governing policy applies no absolute sibling preference. Guardian linkage was still read so co-applying siblings can be drawn together.",
    };
  }

  const allLinkKeys = [...new Set([...linkKeyByStudent.values()].flat())];
  if (allLinkKeys.length === 0) {
    return {
      qualified: new Set(),
      claimedUnverified: claimed,
      linkageUnresolvable: true,
      studentByApplication,
      guardiansByApplication,
      method,
    };
  }

  // ── Those people's other students = candidate siblings ───────────────────
  const candidateStudentsByLinkKey = new Map<string, Set<string>>();

  if (bySharedHousehold) {
    const { data: households } = await supabase
      .from("student")
      .select("id, household_id")
      .in("household_id", allLinkKeys);
    for (const row of (households ?? []) as Array<Record<string, unknown>>) {
      const key = row.household_id as string;
      const set = candidateStudentsByLinkKey.get(key) ?? new Set<string>();
      set.add(row.id as string);
      candidateStudentsByLinkKey.set(key, set);
    }
  } else {
    const { data: links } = await supabase
      .from("guardian_student")
      .select("guardian_id, student_id")
      .in("guardian_id", allLinkKeys)
      .eq("is_legal_guardian", true);
    for (const row of (links ?? []) as Array<Record<string, unknown>>) {
      const key = row.guardian_id as string;
      const set = candidateStudentsByLinkKey.get(key) ?? new Set<string>();
      set.add(row.student_id as string);
      candidateStudentsByLinkKey.set(key, set);
    }
  }

  const applicantStudentIds = new Set(studentIds);
  const candidateStudentIds = new Set<string>();
  for (const set of candidateStudentsByLinkKey.values()) {
    for (const id of set) {
      if (!applicantStudentIds.has(id)) candidateStudentIds.add(id);
    }
  }

  if (candidateStudentIds.size === 0) {
    return {
      qualified: new Set(),
      claimedUnverified: claimed,
      linkageUnresolvable: false,
      studentByApplication,
      guardiansByApplication,
      method,
    };
  }

  // ── Which candidates are actively enrolled at THIS campus, this year ─────
  const currentYearIds = await getCurrentSchoolYearIds(supabase);

  let enrollmentQuery = supabase
    .from("enrollment")
    .select("student_id, school_year_id")
    .in("student_id", [...candidateStudentIds])
    .eq("campus_id", campusId)
    .eq("status", "active");

  if (currentYearIds.length > 0) {
    enrollmentQuery = enrollmentQuery.in("school_year_id", currentYearIds);
  }

  const { data: enrollments } = await enrollmentQuery;

  const enrolledStudentIds = new Set(
    ((enrollments ?? []) as Array<Record<string, unknown>>).map((r) => r.student_id as string)
  );

  const qualified = new Set<string>();
  for (const [applicationId, studentId] of studentByApplication.entries()) {
    const keys = linkKeyByStudent.get(studentId) ?? [];
    for (const key of keys) {
      const candidates = candidateStudentsByLinkKey.get(key);
      if (!candidates) continue;
      let matched = false;
      for (const candidate of candidates) {
        if (candidate !== studentId && enrolledStudentIds.has(candidate)) {
          matched = true;
          break;
        }
      }
      if (matched) {
        qualified.add(applicationId);
        break;
      }
    }
  }

  const claimedUnverified = new Set([...claimed].filter((id) => !qualified.has(id)));

  return {
    qualified,
    claimedUnverified,
    linkageUnresolvable: false,
    studentByApplication,
    guardiansByApplication,
    method:
      currentYearIds.length > 0
        ? method
        : `${method} No school year is currently flagged as current, so active enrollments were counted across all years.`,
  };
}

async function getCurrentSchoolYearIds(supabase: QueryClient): Promise<string[]> {
  const { data } = await supabase.from("school_year").select("id").eq("is_current", true);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => r.id as string);
}

// ─── Linked siblings (both newly applying) ─────────────────────────────────

/**
 * Applications in this same run whose students share a legal guardian (or a
 * household, under the looser policy setting). Under the RSV policy these gain
 * sibling preference only once one of them has been drawn — the activation
 * itself happens in lib/lottery-draw.ts.
 */
export function deriveLinkedSiblings(
  guardiansByApplication: Map<string, string[]>
): Map<string, string[]> {
  const applicationsByGuardian = new Map<string, string[]>();
  for (const [applicationId, guardianIds] of guardiansByApplication.entries()) {
    for (const guardianId of guardianIds) {
      const list = applicationsByGuardian.get(guardianId) ?? [];
      list.push(applicationId);
      applicationsByGuardian.set(guardianId, list);
    }
  }

  const linked = new Map<string, Set<string>>();
  for (const applicationIds of applicationsByGuardian.values()) {
    if (applicationIds.length < 2) continue;
    for (const applicationId of applicationIds) {
      const set = linked.get(applicationId) ?? new Set<string>();
      for (const other of applicationIds) {
        if (other !== applicationId) set.add(other);
      }
      linked.set(applicationId, set);
    }
  }

  const result = new Map<string, string[]>();
  for (const [applicationId, set] of linked.entries()) {
    // Sorted so the pull-in order is deterministic across runs.
    result.set(applicationId, [...set].sort());
  }
  return result;
}

// ─── Weighted tier matching ────────────────────────────────────────────────

export interface TierMatchResult {
  /** application.id -> the tier keys it matched. */
  tierKeysByApplication: Map<string, string[]>;
  /** application.id -> total weight (highest matching tier wins, never summed). */
  weightByApplication: Map<string, number>;
  /** Tier keys whose declared source field is not collected anywhere. */
  unsourcedTierKeys: string[];
  /** Honest per-tier applicant counts, including zeros. */
  matchedCountByTier: Map<string, number>;
}

/**
 * Match applicants to weighted tiers using ONLY the source each tier declares.
 *
 * When an applicant matches more than one weighted tier, the highest weight
 * applies — weights are not summed. The RSV policy states the entry counts as
 * category facts ("5:1", "3:1"), not as stacking bonuses, and inventing a
 * stacking rule would hand some families a 15:1 advantage no board approved.
 */
export async function matchWeightedTiers(
  supabase: QueryClient,
  applicationIds: string[],
  tiers: LotteryPolicyWeightedTier[],
  defaultWeight: number
): Promise<TierMatchResult> {
  const tierKeysByApplication = new Map<string, string[]>();
  const weightByApplication = new Map<string, number>();
  const matchedCountByTier = new Map<string, number>();
  const unsourcedTierKeys: string[] = [];

  for (const id of applicationIds) {
    tierKeysByApplication.set(id, []);
    weightByApplication.set(id, Math.max(1, defaultWeight));
  }

  if (applicationIds.length === 0) {
    for (const tier of tiers) matchedCountByTier.set(tier.key, 0);
    return { tierKeysByApplication, weightByApplication, unsourcedTierKeys, matchedCountByTier };
  }

  for (const tier of tiers) {
    matchedCountByTier.set(tier.key, 0);

    const source = tier.source;

    if (source.kind === "unavailable") {
      unsourcedTierKeys.push(tier.key);
      continue;
    }

    if (source.kind === "application_column") {
      if (!POLICY_MATCHABLE_APPLICATION_COLUMNS.includes(source.field)) {
        unsourcedTierKeys.push(tier.key);
        continue;
      }
      const { data } = await supabase
        .from("application")
        .select("id")
        .in("id", applicationIds)
        .eq(source.field, true);
      recordMatches(
        ((data ?? []) as Array<Record<string, unknown>>).map((r) => r.id as string),
        tier,
        tierKeysByApplication,
        weightByApplication,
        matchedCountByTier
      );
      continue;
    }

    // application_answer
    if (!POLICY_COLLECTED_ANSWER_KEYS.includes(source.field)) {
      // The policy declares a source the application form does not collect.
      // Report the gap; do not fabricate matches and do not report a real zero.
      unsourcedTierKeys.push(tier.key);
      continue;
    }

    const accepted = (source.matchValues ?? ["yes", "true"]).map((v) => v.toLowerCase());
    const { data } = await supabase
      .from("application_answer")
      .select("application_id, value")
      .in("application_id", applicationIds)
      .eq("field_key", source.field);

    const matched = ((data ?? []) as Array<Record<string, unknown>>)
      .filter((row) => accepted.includes(normalizeAnswer(row.value)))
      .map((row) => row.application_id as string);

    recordMatches(matched, tier, tierKeysByApplication, weightByApplication, matchedCountByTier);
  }

  return { tierKeysByApplication, weightByApplication, unsourcedTierKeys, matchedCountByTier };
}

function recordMatches(
  applicationIds: string[],
  tier: LotteryPolicyWeightedTier,
  tierKeysByApplication: Map<string, string[]>,
  weightByApplication: Map<string, number>,
  matchedCountByTier: Map<string, number>
): void {
  let count = 0;
  for (const applicationId of applicationIds) {
    const keys = tierKeysByApplication.get(applicationId);
    if (!keys) continue; // not in this run
    keys.push(tier.key);
    count++;
    const current = weightByApplication.get(applicationId) ?? 1;
    if (tier.weight > current) weightByApplication.set(applicationId, tier.weight);
  }
  matchedCountByTier.set(tier.key, count);
}

/**
 * application_answer.value is JSONB written as JSON.stringify(value), so a
 * boolean arrives as true and a string as "yes". Normalize both to a lowercase
 * scalar string before comparing.
 */
export function normalizeAnswer(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.trim().toLowerCase();
  return String(value).toLowerCase();
}

function isAffirmative(value: unknown): boolean {
  const normalized = normalizeAnswer(value);
  return normalized === "true" || normalized === "yes";
}
