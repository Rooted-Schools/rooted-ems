/**
 * Family decline reasons — playbook PB 24 v2.2 Section 15 (refusal tracking).
 *
 * Why an enum and not free text: the playbook wants refusals reportable by
 * campus and by subgroup, so a fixed vocabulary is the point. The optional
 * note carries the nuance that a fixed vocabulary loses.
 *
 * Why 'other' exists: without an escape hatch families get funnelled into the
 * nearest-wrong bucket, which corrupts the exact dataset this is built to
 * produce. A high 'other' rate is a signal to revisit these options, not a
 * failure.
 *
 * Why every reason is optional: a family that simply clicks decline must not
 * be blocked, and a staff member recording a decline taken by phone may not
 * have asked. Null means "not captured", never "no reason existed".
 */

export const DECLINE_REASONS = [
  "chose_another_school",
  "transportation",
  "program_fit",
  "moved",
  "timing",
  "other",
] as const;

export type DeclineReason = (typeof DECLINE_REASONS)[number];

/**
 * Translation keys for the family-facing picker.
 *
 * `as const` keeps these as literal types rather than widening to `string`,
 * which is what lets t() verify at build time that each key actually exists in
 * the dictionary. `satisfies` still enforces that every reason has one, so a
 * new reason cannot be added without its label.
 */
export const DECLINE_REASON_LABEL_KEY = {
  chose_another_school: "offers.declineReason.chose_another_school",
  transportation: "offers.declineReason.transportation",
  program_fit: "offers.declineReason.program_fit",
  moved: "offers.declineReason.moved",
  timing: "offers.declineReason.timing",
  other: "offers.declineReason.other",
} as const satisfies Record<DeclineReason, string>;

/** Staff-facing English labels for reports, which are not translated. */
export const DECLINE_REASON_STAFF_LABEL: Record<DeclineReason, string> = {
  chose_another_school: "Chose another school",
  transportation: "Transportation",
  program_fit: "Program fit",
  moved: "Moved out of area",
  timing: "Timing",
  other: "Other",
};

export function isDeclineReason(value: unknown): value is DeclineReason {
  return typeof value === "string" && (DECLINE_REASONS as readonly string[]).includes(value);
}
