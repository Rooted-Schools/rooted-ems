/**
 * SIS adapter resolution.
 *
 * Deliberately fails loudly rather than returning a no-op adapter. A silent
 * stub would let callers believe attendance was flowing and would render the
 * funnel's Retain stage as healthy on a dataset that is simply empty, which is
 * a worse outcome than an obvious gap.
 */

import { SisNotImplementedError, type SisAdapter, type SisPlatform } from "./types";

export * from "./types";

/**
 * Resolve the adapter for a campus.
 *
 * @throws SisNotImplementedError always, at present. Callers should catch it
 *   and degrade, which is what the funnel's Retain stage already does by
 *   reporting `unavailable` with a reason rather than a number.
 */
export function getSisAdapter(platform: SisPlatform | null): SisAdapter {
  throw new SisNotImplementedError(platform);
}

/**
 * Whether any SIS work can run at all.
 *
 * Exported so surfaces can check before offering an action, rather than
 * offering a button that always throws.
 */
export function isSisAvailable(): boolean {
  return false;
}

/**
 * Implementation notes for whoever picks this up, so the next session does not
 * start from a blank page.
 *
 * POWERSCHOOL (C.R. Neal, Cleveland)
 *   Auth is OAuth2 client credentials against a plugin installed in the
 *   district's PowerSchool instance; the plugin XML declares which tables and
 *   fields the integration may touch, so scope has to be agreed before any
 *   code runs. Bulk reads go through PowerQuery. Attendance lives in the
 *   `attendance` table keyed by `studentid` and `att_date`, and the meaning of
 *   an attendance code is district-configurable, so "present" cannot be
 *   hardcoded and must be mapped per district.
 *
 * SKYWARD QMLATIV (Vancouver)
 *   Different auth and a different object model. Qmlativ exposes a REST API
 *   with its own entity naming; do not assume PowerSchool's field names
 *   translate.
 *
 * BOTH
 *   Both support OneRoster. Where a needed field is available through
 *   OneRoster, prefer it: the shared surface is the whole reason this
 *   interface exists. Fall back to native APIs only where OneRoster genuinely
 *   cannot answer the question, and note why at the call site.
 *
 * FIRST TASK, BEFORE ANY API CALL
 *   Identity reconciliation. `enrollment.sis_student_id` exists but is
 *   unpopulated, so nothing today can match an EMS student to an SIS student.
 *   Matching on name and date of birth will produce ambiguous cases (siblings,
 *   twins, name changes) and those need a human review queue, not a
 *   best-guess auto-match. Auto-matching a student to the wrong SIS record
 *   attaches one child's attendance and IEP history to another.
 */
