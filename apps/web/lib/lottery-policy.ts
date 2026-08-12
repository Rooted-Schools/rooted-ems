/**
 * Lottery policy configuration — typed schema, validation, and rendering.
 *
 * The stored shape lives in lottery_policy.config (supabase/migrations/
 * 00047_lottery_policy.sql) and is copied verbatim onto lottery_run.
 * policy_snapshot when a run is created. Everything in this file is pure: no
 * database, no session, no side effects, so it is importable from server
 * mutations, server components, client components, and tests alike.
 *
 * GOVERNING SOURCE for the seeded RSV configuration:
 *   Rooted School Vancouver Board Enrollment Policy,
 *   adopted 2023-01-25, revised 2024-08-20.
 *
 * Two rules shape this module:
 *
 *   1. Nothing is inferred. A field that is absent parses as absent, and the
 *      caller is told. A policy that cannot be parsed is not silently swapped
 *      for a default — the engine refuses to treat the run as governed.
 *
 *   2. Every preference beyond the RSV base is opt-in and requires an
 *      authority citation before it can be saved enabled. Preferences are
 *      constrained by state charter law and board action; the software must
 *      not make one easy to turn on by accident.
 */

// ─── Source declarations ───────────────────────────────────────────────────
//
// Where a weighted tier's indicator comes from. The engine reads ONLY what a
// policy declares here — it never guesses a column or a question key.

export type LotteryPolicySourceKind =
  | "application_column"
  | "application_answer"
  | "unavailable";

export interface LotteryPolicySource {
  kind: LotteryPolicySourceKind;
  /** Column name on `application`, or application_answer.field_key. */
  field: string;
  /** Values that grant the tier, compared case-insensitively. Defaults to yes/true. */
  matchValues?: string[];
  /** Plain-English provenance, shown to staff. */
  note?: string;
}

/**
 * Boolean columns on `application` a policy may reference. Matcher fields come
 * out of the database and end up in query filters — never widen this beyond
 * columns that actually exist and are actually boolean.
 * (supabase/migrations/00004_applications.sql:50)
 */
export const POLICY_MATCHABLE_APPLICATION_COLUMNS: readonly string[] = [
  "has_sibling_enrolled",
];

/**
 * application_answer.field_key values the application forms actually write.
 * Mirrors ALLOWED_ANSWER_KEYS in lib/mutations/applications.ts — a policy may
 * reference a key outside this list, but the engine will report the tier as
 * unsourced rather than pretend it matched nobody by choice.
 */
export const POLICY_COLLECTED_ANSWER_KEYS: readonly string[] = [
  "has_sibling_at_school",
  "sibling_name",
  "data_sharing_consent",
  "agree_terms",
  "e_signature_name",
  "e_signature_date",
  "guardian_relationship_other",
];

// ─── Absolute preferences ──────────────────────────────────────────────────

export interface LotteryPolicyAbsolutePreference {
  key: string;
  label: string;
  enabled: boolean;
  /** Seats assigned before the draw when space exists. */
  autoOfferBeforeDraw: boolean;
  /** Overflow goes to a priority waitlist band ahead of the general waitlist. */
  overflowToPriorityWaitlist: boolean;
  /** How the sibling relationship is established in the data. */
  siblingDefinition: "shared_legal_guardian" | "shared_household";
  definition: string;
  fosterExcludedUntilLegalGuardianship: boolean;
  verificationMayBeRequired: boolean;
  falseClaimForfeitsSeat: boolean;
  authorityNote: string;
}

// ─── Weighted tiers ────────────────────────────────────────────────────────

export interface LotteryPolicyWeightedTier {
  key: string;
  label: string;
  /** Lottery entries per applicant. 5 means five chances, never a guarantee. */
  weight: number;
  enabled: boolean;
  /**
   * True for tiers offered by the editor beyond the RSV base. Optional tiers
   * must carry an authorityNote before they can be saved enabled.
   */
  optional: boolean;
  source: LotteryPolicySource;
  authorityNote: string;
  /** Founders'-children style cap: share of seats this tier may take, 0 = none set. */
  capPercent?: number;
}

// ─── Optional features (editor extras, all disabled by default) ────────────

export interface LotteryPolicyOptionalFeature {
  enabled: boolean;
  authorityNote: string;
  weight?: number;
  capPercent?: number;
  zoneDescription?: string;
  note?: string;
}

export interface LotteryPolicyOptionalFeatures {
  multiBirthSingleUnit: LotteryPolicyOptionalFeature;
  foundersChildren: LotteryPolicyOptionalFeature;
  geographicZone: LotteryPolicyOptionalFeature;
  militaryFamily: LotteryPolicyOptionalFeature;
  boardMemberChildren: LotteryPolicyOptionalFeature;
  returningStudentExemption: LotteryPolicyOptionalFeature;
}

/**
 * Standing copy shown above every optional preference in the editor. Not
 * decoration: enabling an unauthorized preference is the fastest way to lose a
 * charter lottery challenge.
 */
export const OPTIONAL_PREFERENCE_STANDING_WARNING =
  "Preferences must be authorized by your state charter law and adopted board policy. Confirm with counsel before enabling.";

/** Extra warning attached to the board-member-children option specifically. */
export const BOARD_MEMBER_PREFERENCE_WARNING =
  "A preference for board members' children is a conflict-of-interest exposure in most states and is prohibited in some. Do not enable this without written counsel review.";

export const OPTIONAL_FEATURE_LABELS: Record<keyof LotteryPolicyOptionalFeatures, string> = {
  multiBirthSingleUnit: "Multi-birth siblings drawn as a single unit",
  foundersChildren: "Founders' children tier (with percentage cap)",
  geographicZone: "Geographic or educationally disadvantaged zone priority",
  militaryFamily: "Military family tier",
  boardMemberChildren: "Board member children tier",
  returningStudentExemption: "Returning student exemption note",
};

// ─── Windows, observers, and the rest of the configuration ─────────────────

export interface LotteryPolicyApplicationWindow {
  opensMonthDay: string;
  closesRule: string;
  note: string;
}

export interface LotteryPolicyLotteryDate {
  monthDay: string;
  weekendRule: string;
  note: string;
}

export interface LotteryPolicyWaitlistOfferWindow {
  days: number;
  cutoffTime: string;
  note: string;
}

export interface LotteryPolicyObserver {
  role: string;
  required: boolean;
}

export interface LotteryPolicyPostLotteryRolling {
  allowed: boolean;
  exceptions: string[];
}

export interface LotteryPolicyConfig {
  schemaVersion: number;
  jurisdiction: string;
  adoptedBy: string;
  sourceDocument: string;
  administeredBy: string;

  applicationWindow: LotteryPolicyApplicationWindow;
  lotteryDate: LotteryPolicyLotteryDate;

  absolutePreferences: LotteryPolicyAbsolutePreference[];

  defaultWeight: number;
  weightedTiers: LotteryPolicyWeightedTier[];

  linkedSiblingActivation: boolean;
  legacyPreference: false;

  preferencesFromOriginalApplicationOnly: boolean;
  falsifiedInformationInvalidates: boolean;
  preferenceClaimNote: string;

  acceptanceWindowDays: number;
  acceptanceCutoffTime: string;
  acceptanceNote: string;
  waitlistNotifyDayOffset: number;
  enrollmentPacketDueDays: number;
  reenrollmentDueDays: number;

  waitlistOfferWindow: LotteryPolicyWaitlistOfferWindow;
  waitlistScope: string;
  waitlistCarryover: boolean;
  waitlistNote: string;

  observers: LotteryPolicyObserver[];
  openMeetingsActCompliance: boolean;
  openMeetingsActNote: string;

  postLotteryRolling: LotteryPolicyPostLotteryRolling;
  backfillRule: string;
  mckinneyVentoNote: string;

  optionalFeatures: LotteryPolicyOptionalFeatures;
}

// ─── Parsing and validation ────────────────────────────────────────────────

export interface LotteryPolicyParseResult {
  config: LotteryPolicyConfig | null;
  errors: string[];
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asBool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function parseSource(raw: unknown, path: string, errors: string[]): LotteryPolicySource {
  const r = (raw ?? {}) as Record<string, unknown>;
  const kind = asString(r.kind) as LotteryPolicySourceKind;
  if (kind !== "application_column" && kind !== "application_answer" && kind !== "unavailable") {
    errors.push(`${path}.source.kind must be "application_column", "application_answer", or "unavailable".`);
  }
  const field = asString(r.field);
  if (kind !== "unavailable" && !field.trim()) {
    errors.push(`${path}.source.field is required when the source is a column or an answer.`);
  }
  if (kind === "application_column" && field && !POLICY_MATCHABLE_APPLICATION_COLUMNS.includes(field)) {
    errors.push(
      `${path}.source.field "${field}" is not an allowed application column. Allowed: ${POLICY_MATCHABLE_APPLICATION_COLUMNS.join(", ")}.`
    );
  }
  const matchValues = asStringArray(r.matchValues);
  return {
    kind: kind === "application_column" || kind === "application_answer" ? kind : "unavailable",
    field,
    matchValues: matchValues.length > 0 ? matchValues : undefined,
    note: asString(r.note) || undefined,
  };
}

function parseOptionalFeature(
  raw: unknown,
  label: string,
  errors: string[]
): LotteryPolicyOptionalFeature {
  const r = (raw ?? {}) as Record<string, unknown>;
  const enabled = asBool(r.enabled, false);
  const authorityNote = asString(r.authorityNote);
  if (enabled && !authorityNote.trim()) {
    errors.push(
      `"${label}" is enabled but carries no authority citation. Every optional preference needs the state law or board policy that authorizes it before it can be saved.`
    );
  }
  const feature: LotteryPolicyOptionalFeature = { enabled, authorityNote };
  if (r.weight !== undefined) feature.weight = asNumber(r.weight, 1);
  if (r.capPercent !== undefined) feature.capPercent = asNumber(r.capPercent, 0);
  if (r.zoneDescription !== undefined) feature.zoneDescription = asString(r.zoneDescription);
  if (r.note !== undefined) feature.note = asString(r.note);
  if (feature.weight !== undefined && (!Number.isInteger(feature.weight) || feature.weight < 1)) {
    errors.push(`"${label}" weight must be a whole number of at least 1.`);
  }
  if (
    feature.capPercent !== undefined &&
    (feature.capPercent < 0 || feature.capPercent > 100)
  ) {
    errors.push(`"${label}" cap must be between 0 and 100 percent.`);
  }
  return feature;
}

const EMPTY_OPTIONAL: LotteryPolicyOptionalFeature = { enabled: false, authorityNote: "" };

/**
 * Parse a stored policy config. Returns the config plus every problem found —
 * never a silently repaired object. A caller holding errors must treat the
 * policy as unusable for an official run.
 */
export function parseLotteryPolicyConfig(raw: unknown): LotteryPolicyParseResult {
  const errors: string[] = [];

  if (raw === null || raw === undefined || typeof raw !== "object" || Array.isArray(raw)) {
    return { config: null, errors: ["Policy configuration is missing or is not an object."] };
  }

  const r = raw as Record<string, unknown>;

  // Absolute preferences
  const absolutePreferences: LotteryPolicyAbsolutePreference[] = [];
  const absRaw = Array.isArray(r.absolutePreferences) ? r.absolutePreferences : [];
  absRaw.forEach((item, idx) => {
    const a = (item ?? {}) as Record<string, unknown>;
    const key = asString(a.key);
    if (!key) errors.push(`absolutePreferences[${idx}].key is required.`);
    const siblingDefinition = asString(a.siblingDefinition, "shared_legal_guardian");
    if (siblingDefinition !== "shared_legal_guardian" && siblingDefinition !== "shared_household") {
      errors.push(
        `absolutePreferences[${idx}].siblingDefinition must be "shared_legal_guardian" or "shared_household".`
      );
    }
    const enabled = asBool(a.enabled, false);
    const authorityNote = asString(a.authorityNote);
    if (enabled && !authorityNote.trim()) {
      errors.push(
        `absolutePreferences[${idx}] ("${asString(a.label, key)}") is enabled but carries no authority citation.`
      );
    }
    absolutePreferences.push({
      key,
      label: asString(a.label, key),
      enabled,
      autoOfferBeforeDraw: asBool(a.autoOfferBeforeDraw, false),
      overflowToPriorityWaitlist: asBool(a.overflowToPriorityWaitlist, false),
      siblingDefinition:
        siblingDefinition === "shared_household" ? "shared_household" : "shared_legal_guardian",
      definition: asString(a.definition),
      fosterExcludedUntilLegalGuardianship: asBool(a.fosterExcludedUntilLegalGuardianship, false),
      verificationMayBeRequired: asBool(a.verificationMayBeRequired, false),
      falseClaimForfeitsSeat: asBool(a.falseClaimForfeitsSeat, false),
      authorityNote,
    });
  });

  // Weighted tiers
  const weightedTiers: LotteryPolicyWeightedTier[] = [];
  const tiersRaw = Array.isArray(r.weightedTiers) ? r.weightedTiers : [];
  const seenKeys = new Set<string>();
  tiersRaw.forEach((item, idx) => {
    const t = (item ?? {}) as Record<string, unknown>;
    const key = asString(t.key);
    const label = asString(t.label, key);
    if (!key) {
      errors.push(`weightedTiers[${idx}].key is required.`);
    } else if (seenKeys.has(key)) {
      errors.push(`weightedTiers contains more than one tier with the key "${key}".`);
    } else {
      seenKeys.add(key);
    }
    const weight = asNumber(t.weight, 0);
    if (!Number.isInteger(weight) || weight < 1) {
      errors.push(
        `weightedTiers[${idx}] ("${label}") weight must be a whole number of at least 1. A weight of ${String(t.weight)} cannot be turned into lottery entries.`
      );
    }
    const optional = asBool(t.optional, false);
    const enabled = asBool(t.enabled, false);
    const authorityNote = asString(t.authorityNote);
    if (enabled && optional && !authorityNote.trim()) {
      errors.push(
        `weightedTiers[${idx}] ("${label}") is enabled but carries no authority citation. ${OPTIONAL_PREFERENCE_STANDING_WARNING}`
      );
    }
    const capPercent = t.capPercent === undefined ? undefined : asNumber(t.capPercent, 0);
    if (capPercent !== undefined && (capPercent < 0 || capPercent > 100)) {
      errors.push(`weightedTiers[${idx}] ("${label}") cap must be between 0 and 100 percent.`);
    }
    weightedTiers.push({
      key,
      label,
      weight: Number.isInteger(weight) && weight >= 1 ? weight : 1,
      enabled,
      optional,
      source: parseSource(t.source, `weightedTiers[${idx}]`, errors),
      authorityNote,
      capPercent,
    });
  });

  const defaultWeight = asNumber(r.defaultWeight, 1);
  if (!Number.isInteger(defaultWeight) || defaultWeight < 1) {
    errors.push("defaultWeight must be a whole number of at least 1.");
  }

  const acceptanceWindowDays = asNumber(r.acceptanceWindowDays, 0);
  if (!Number.isInteger(acceptanceWindowDays) || acceptanceWindowDays < 1) {
    errors.push(
      "acceptanceWindowDays must be a whole number of at least 1. Families need a stated deadline to accept a seat."
    );
  }

  const waitlistWindowRaw = (r.waitlistOfferWindow ?? {}) as Record<string, unknown>;
  const waitlistWindowDays = asNumber(waitlistWindowRaw.days, 0);
  if (!Number.isInteger(waitlistWindowDays) || waitlistWindowDays < 1) {
    errors.push("waitlistOfferWindow.days must be a whole number of at least 1.");
  }

  if (r.legacyPreference === true) {
    errors.push(
      "legacyPreference cannot be true. A preference for siblings of graduated or departed students is not part of this policy framework."
    );
  }

  const ofRaw = (r.optionalFeatures ?? {}) as Record<string, unknown>;
  const optionalFeatures: LotteryPolicyOptionalFeatures = {
    multiBirthSingleUnit: parseOptionalFeature(
      ofRaw.multiBirthSingleUnit,
      OPTIONAL_FEATURE_LABELS.multiBirthSingleUnit,
      errors
    ),
    foundersChildren: parseOptionalFeature(
      ofRaw.foundersChildren,
      OPTIONAL_FEATURE_LABELS.foundersChildren,
      errors
    ),
    geographicZone: parseOptionalFeature(
      ofRaw.geographicZone,
      OPTIONAL_FEATURE_LABELS.geographicZone,
      errors
    ),
    militaryFamily: parseOptionalFeature(
      ofRaw.militaryFamily,
      OPTIONAL_FEATURE_LABELS.militaryFamily,
      errors
    ),
    boardMemberChildren: parseOptionalFeature(
      ofRaw.boardMemberChildren,
      OPTIONAL_FEATURE_LABELS.boardMemberChildren,
      errors
    ),
    returningStudentExemption: parseOptionalFeature(
      ofRaw.returningStudentExemption,
      OPTIONAL_FEATURE_LABELS.returningStudentExemption,
      errors
    ),
  };

  const appWindow = (r.applicationWindow ?? {}) as Record<string, unknown>;
  const lotteryDate = (r.lotteryDate ?? {}) as Record<string, unknown>;
  const rolling = (r.postLotteryRolling ?? {}) as Record<string, unknown>;

  const config: LotteryPolicyConfig = {
    schemaVersion: asNumber(r.schemaVersion, 1),
    jurisdiction: asString(r.jurisdiction),
    adoptedBy: asString(r.adoptedBy),
    sourceDocument: asString(r.sourceDocument),
    administeredBy: asString(r.administeredBy),

    applicationWindow: {
      opensMonthDay: asString(appWindow.opensMonthDay),
      closesRule: asString(appWindow.closesRule),
      note: asString(appWindow.note),
    },
    lotteryDate: {
      monthDay: asString(lotteryDate.monthDay),
      weekendRule: asString(lotteryDate.weekendRule),
      note: asString(lotteryDate.note),
    },

    absolutePreferences,
    defaultWeight: Number.isInteger(defaultWeight) && defaultWeight >= 1 ? defaultWeight : 1,
    weightedTiers,

    linkedSiblingActivation: asBool(r.linkedSiblingActivation, false),
    legacyPreference: false,

    preferencesFromOriginalApplicationOnly: asBool(r.preferencesFromOriginalApplicationOnly, true),
    falsifiedInformationInvalidates: asBool(r.falsifiedInformationInvalidates, true),
    preferenceClaimNote: asString(r.preferenceClaimNote),

    acceptanceWindowDays:
      Number.isInteger(acceptanceWindowDays) && acceptanceWindowDays >= 1 ? acceptanceWindowDays : 14,
    acceptanceCutoffTime: asString(r.acceptanceCutoffTime, "16:00"),
    acceptanceNote: asString(r.acceptanceNote),
    waitlistNotifyDayOffset: asNumber(r.waitlistNotifyDayOffset, 0),
    enrollmentPacketDueDays: asNumber(r.enrollmentPacketDueDays, 0),
    reenrollmentDueDays: asNumber(r.reenrollmentDueDays, 0),

    waitlistOfferWindow: {
      days: Number.isInteger(waitlistWindowDays) && waitlistWindowDays >= 1 ? waitlistWindowDays : 2,
      cutoffTime: asString(waitlistWindowRaw.cutoffTime, "16:00"),
      note: asString(waitlistWindowRaw.note),
    },
    waitlistScope: asString(r.waitlistScope, "per_grade"),
    waitlistCarryover: asBool(r.waitlistCarryover, false),
    waitlistNote: asString(r.waitlistNote),

    observers: (Array.isArray(r.observers) ? r.observers : []).map((o) => {
      const obs = (o ?? {}) as Record<string, unknown>;
      return { role: asString(obs.role), required: asBool(obs.required, false) };
    }),
    openMeetingsActCompliance: asBool(r.openMeetingsActCompliance, false),
    openMeetingsActNote: asString(r.openMeetingsActNote),

    postLotteryRolling: {
      allowed: asBool(rolling.allowed, false),
      exceptions: asStringArray(rolling.exceptions),
    },
    backfillRule: asString(r.backfillRule),
    mckinneyVentoNote: asString(r.mckinneyVentoNote),

    optionalFeatures,
  };

  return { config, errors };
}

/** True when the config parsed with no problems at all. */
export function isLotteryPolicyConfigValid(raw: unknown): boolean {
  return parseLotteryPolicyConfig(raw).errors.length === 0;
}

// ─── Derived helpers the engine and the UI both use ────────────────────────

/** Weighted tiers that are switched on, in declaration order. */
export function enabledWeightedTiers(config: LotteryPolicyConfig): LotteryPolicyWeightedTier[] {
  return config.weightedTiers.filter((t) => t.enabled);
}

/** The sibling absolute preference, when the policy has one enabled. */
export function siblingAbsolutePreference(
  config: LotteryPolicyConfig
): LotteryPolicyAbsolutePreference | null {
  return (
    config.absolutePreferences.find((p) => p.key === "sibling_current_enrolled" && p.enabled) ?? null
  );
}

/**
 * Tiers whose declared source is not something the application forms actually
 * collect. Reported honestly rather than being silently treated as "nobody
 * qualified" — those are very different facts.
 */
export function unsourcedWeightedTiers(
  config: LotteryPolicyConfig
): LotteryPolicyWeightedTier[] {
  return enabledWeightedTiers(config).filter((tier) => {
    if (tier.source.kind === "unavailable") return true;
    if (tier.source.kind === "application_column") {
      return !POLICY_MATCHABLE_APPLICATION_COLUMNS.includes(tier.source.field);
    }
    return !POLICY_COLLECTED_ANSWER_KEYS.includes(tier.source.field);
  });
}

/** Offer expiry timestamp for a lottery offer, from the policy acceptance window. */
export function acceptanceExpiryFrom(
  config: LotteryPolicyConfig,
  from: Date = new Date()
): string {
  return new Date(from.getTime() + config.acceptanceWindowDays * 24 * 60 * 60 * 1000).toISOString();
}

/** Offer expiry timestamp for a waitlist promotion, from the policy waitlist window. */
export function waitlistOfferExpiryFrom(
  config: LotteryPolicyConfig,
  from: Date = new Date()
): string {
  return new Date(
    from.getTime() + config.waitlistOfferWindow.days * 24 * 60 * 60 * 1000
  ).toISOString();
}

// ─── Plain-English rendering ───────────────────────────────────────────────

export interface PolicyStatement {
  heading: string;
  lines: string[];
}

/**
 * Render the configuration as staff-readable statements. Used by the Policy
 * tab and by the run report so the rules a family was subject to can be read
 * by a board member without reading JSON.
 */
export function renderPolicyStatements(config: LotteryPolicyConfig): PolicyStatement[] {
  const statements: PolicyStatement[] = [];

  const windows: string[] = [];
  if (config.applicationWindow.note) windows.push(config.applicationWindow.note);
  if (config.lotteryDate.note) windows.push(config.lotteryDate.note);
  if (config.acceptanceNote) windows.push(config.acceptanceNote);
  if (config.enrollmentPacketDueDays > 0) {
    windows.push(`Enrollment packets are due ${config.enrollmentPacketDueDays} days after the offer.`);
  }
  if (config.reenrollmentDueDays > 0) {
    windows.push(
      `Re-enrollment forms are due ${config.reenrollmentDueDays} days after they are distributed.`
    );
  }
  if (windows.length > 0) statements.push({ heading: "Dates and deadlines", lines: windows });

  const preferences: string[] = [];
  for (const pref of config.absolutePreferences) {
    if (!pref.enabled) continue;
    preferences.push(`${pref.label}. ${pref.definition}`);
    if (pref.autoOfferBeforeDraw) {
      preferences.push(
        "These applicants are offered seats before the draw when the grade has space. If there are more of them than seats, they are randomized among themselves and the remainder go to a sibling-priority waitlist ahead of the general waitlist."
      );
    }
    if (pref.verificationMayBeRequired) {
      preferences.push(
        "The school may require verification of the relationship. A false claim forfeits the seat."
      );
    }
  }
  if (config.linkedSiblingActivation) {
    preferences.push(
      "Siblings who are both new applicants gain sibling preference only after one of them is drawn in that year's lottery."
    );
  }
  preferences.push(
    "There is no legacy preference. Siblings of graduated or departed students receive no advantage."
  );
  statements.push({ heading: "Preferences applied before the draw", lines: preferences });

  const weighting: string[] = [];
  for (const tier of config.weightedTiers) {
    if (!tier.enabled) continue;
    weighting.push(
      `${tier.label}: ${tier.weight} ${tier.weight === 1 ? "entry" : "entries"} per applicant.`
    );
  }
  weighting.push(
    `All other applicants: ${config.defaultWeight} ${config.defaultWeight === 1 ? "entry" : "entries"}.`
  );
  weighting.push(
    "Weighted entries multiply an applicant's chances. They are not a guarantee of a seat."
  );
  if (config.preferenceClaimNote) weighting.push(config.preferenceClaimNote);
  statements.push({ heading: "Weighted entries", lines: weighting });

  const waitlist: string[] = [];
  if (config.waitlistOfferWindow.note) waitlist.push(config.waitlistOfferWindow.note);
  if (config.waitlistNote) waitlist.push(config.waitlistNote);
  waitlist.push(
    config.waitlistCarryover
      ? "Waitlists carry over from year to year."
      : "Waitlists never carry over from year to year."
  );
  if (!config.postLotteryRolling.allowed) {
    waitlist.push("Applications are not accepted on a rolling basis after the lottery, except when:");
    for (const exception of config.postLotteryRolling.exceptions) {
      waitlist.push(`  ${exception}`);
    }
  }
  if (config.backfillRule) waitlist.push(config.backfillRule);
  statements.push({ heading: "Waitlist and post-lottery enrollment", lines: waitlist });

  const conduct: string[] = [];
  if (config.administeredBy) conduct.push(`The lottery is run by the ${config.administeredBy}.`);
  const requiredObservers = config.observers.filter((o) => o.required).map((o) => o.role);
  if (requiredObservers.length > 0) {
    conduct.push(`Required observers: ${requiredObservers.join(", ")}.`);
  }
  if (config.openMeetingsActNote) conduct.push(config.openMeetingsActNote);
  if (config.mckinneyVentoNote) conduct.push(config.mckinneyVentoNote);
  if (conduct.length > 0) statements.push({ heading: "How the lottery is conducted", lines: conduct });

  return statements;
}

/** One-line governance label for run pages and reports. */
export function governanceLabel(policy: {
  name: string;
  version: number;
  adopted_date: string | null;
} | null): string {
  if (!policy) return "No adopted policy";
  const adopted = policy.adopted_date ? ` (adopted ${policy.adopted_date})` : "";
  return `${policy.name} v${policy.version}${adopted}`;
}

/** The single honest sentence shown wherever an official run is blocked. */
export const NO_ADOPTED_POLICY_MESSAGE =
  "No adopted lottery policy for this campus. Official lotteries require one.";
