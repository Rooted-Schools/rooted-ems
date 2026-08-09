# Playbook Alignment: Scope of All Six Items
**Date:** 2026-08-09 · Companion to `PLAYBOOK_ALIGNMENT_ANALYSIS.md`
**Status:** scope only. Nothing built, nothing committed.

---

## Two corrections to my earlier analysis

**1. The equity engine is stronger than I said.** `lib/queries/equity-funnel.ts`
already does stage-by-stage conversion by group, reads from
`application_status_history` rather than current status (so families who were
offered and later withdrew still count in the denominator), carries numerator and
denominator on every cell, and suppresses any group under n=10 rather than printing
a meaningless rate. That is better practice than the Workbook itself. My "equity
tracking is incomplete" framing undersold it. The gaps are narrower and more
specific than I implied, listed under Item 4.

**2. There is no SIS integration of any kind.** I checked for PowerSchool, Skyward,
Qmlativ, and OneRoster across the entire codebase and found zero references. Item 6
is greenfield, and it is much larger than the other five combined.

---

## Item 1. Weekly melt cadence and 14-day risk flag

**Playbook:** weekly personal outreach from lottery day through first day; auto-flag
at 14+ days since contact.
**Today:** one message, ever. `cron/keep-the-seat` gates on
`keep_the_seat_sent_at IS NULL` and atomically claims each row.

**Good news on dependencies.** Everything needed already exists:
`registration_packet.contacted_at`, `registration_packet.keep_the_seat_sent_at`,
`school_year.start_date` (the first day of school, so the window has a natural end),
and `contact_log` for method and outcome.

**Changes**
- Migration: add `last_outreach_at` (or repurpose `contacted_at` as the cadence
  clock) and drop the partial index that assumes send-once.
- `cron/keep-the-seat`: replace the null-gate with `last_outreach_at < now() - 7
  days AND now() < school_year.start_date`. Keep the atomic claim so concurrent
  runs cannot double-send.
- New query in `lib/queries/melt.ts`: days-since-contact per enrolled family.
- Surface an at-risk list on `/staff/today`.

**Effort:** 1 to 2 days. **Risk:** low. **Reversible:** yes.
**Open decision:** weekly automated email, or automated email plus a staff call
task? The playbook says "personal outreach," which an automated email arguably is
not. My read is the cron should generate a *call task* weekly and send email only as
backup, otherwise we have automated our way out of the thing that works.

## Item 2. Five-stage funnel view

**Changes**
- New `lib/queries/funnel.ts` mapping playbook stages to data: Generate Interest
  (`crm_leads`), Engage & Inform (leads with engagement), Apply (`application`),
  Enroll (`offer` → `enrollment`), Retain (post-enrollment).
- New page `/staff/funnel` with the five stages, counts, stage conversion, and
  GREEN / YELLOW / RED against target.
- Leave `PIPELINE_STAGES` alone. It is a good work queue and should stay one. This
  is a second, strategic view, not a replacement.

**Effort:** 2 to 3 days. **Risk:** low, read-only. **Depends on:** nothing.

## Item 3. Funnel math calculator

**Playbook Tab 1:** seats ÷0.95 melt ÷0.85 acceptance ÷0.85 lottery efficiency
÷0.50 inquiry-to-app; 3× stretch; 1.5× waitlist. Channel benchmarks: referral 20%,
CBO 10%, digital 6%, cold 5%.

**Good news:** `capacity_plan.total_seats` per campus, grade, and year is already the
exact input. And the `setting` table (`campus_id` + `key` + JSONB, unique per campus)
is the right home for per-campus benchmark overrides, so a campus can tune its own
conversion assumptions as real data accumulates.

**Changes:** seed default benchmarks into `setting`; compute targets and pace-to-
target; render on the Item 2 page.

**Effort:** 1 to 2 days. **Risk:** low. **Depends on:** Item 2 for its surface.

## Item 4. Equity completion

**What is actually missing** (narrower than my first pass suggested):

| Gap | Status |
|---|---|
| Gap threshold | App uses `GAP_FLAG_POINTS = 15`. Playbook mandates **10**. One-line change, needs your sign-off. |
| IEP cut | `student.has_iep` and `has_504` **exist and are unused**. Wiring only. |
| Income / FRL cut | **No structured field.** Exists only as document requirements. Needs schema + policy decision. |
| McKinney-Vento cut | No field. Needs schema. |
| Root-cause workflow | Absent. Playbook requires a written plan within 30 days of a flag. |

**Legal flag, and I would not skip this one.** Collecting household income during
the *application* window is risky for a lottery-based charter. Income must not
influence admission, and collecting it pre-lottery invites exactly that challenge
from an authorizer. My recommendation is to collect FRL and housing status **only
after enrollment**, keep it out of any lottery-facing surface, and have counsel
confirm before the field ships. That still satisfies the Equity Tracker, which
measures outcomes by group rather than screening by group.

**Tension worth naming:** the Workbook wants every subgroup reported; the app
suppresses cells under n=10. The app is right. At C.R. Neal's founding size most
subgroup cells will be suppressed for a full cycle, so the equity report will look
sparse and that is correct behavior, not a bug. Expect it, and do not let anyone
"fix" it by lowering the threshold.

**Effort:** 2 to 3 days for threshold, IEP wiring, and gap flag. Add 1 to 2 days for
new fields once the policy question is settled. **Risk:** low technically, moderate
legally.

## Item 5. Decline reason capture

**Today:** `declineOffer(offerId, declinedBy)` records status only. `revoke_reason`
is staff-side; `removal_reason` is waitlist. Nothing captures why a *family* said no.

**Changes:** add `offer.decline_reason` plus a short enum (chose another school,
transportation, program fit, moved, timing, other) with optional free text; extend
`declineOffer`; add the picker to the family decline flow; report by campus and
subgroup.

**Effort:** half a day to 1 day. **Risk:** very low. Cheapest item, compounds every
cycle. I would do this first alongside Item 1 purely because it is nearly free.

## Item 6. 30-day retention and Day 1 attendance (SIS integration)

This is not one project. It is two, across two platforms.

**Direction A, outbound provisioning.** Enrolled student and guardian records need to
land in the SIS without rekeying. **Direction B, inbound attendance.** Day 1
attendance and 30-day retention require attendance and active-enrollment data flowing
back.

**Blocking prerequisite: identity.** There is **no `sis_id` on `student`**. Nothing
today can match an EMS student to an SIS student. Any SIS work starts with a mapping
column plus a reconciliation process for mismatches, and that is unglamorous work
that everything else depends on.

**Platform notes**
- **PowerSchool SIS:** plugin-based REST API with OAuth client credentials, plus
  PowerQuery for bulk reads. Also supports OneRoster.
- **Skyward Qmlativ:** REST API, different auth and object model. Also supports
  OneRoster.
- **Recommendation:** build one internal interface and two thin adapters, and use
  **OneRoster** wherever both support it so the shared surface is as wide as
  possible. Do not write PowerSchool-shaped code and bolt Skyward on later.

**Effort:** 3 to 6 weeks, driven mostly by credentials, sandbox access, and identity
reconciliation rather than by code volume. **Risk:** high, and largely outside our
control. **Recommendation: do not let this block Items 1 through 5.**

**I need from you:** which campus runs which SIS. My assumption is Vancouver on
Skyward Qmlativ, with Columbia and Cleveland on PowerSchool, but I have not verified
that and it changes sequencing.

---

## Recommended commit order

| Phase | Items | Effort | Why |
|---|---|---|---|
| **A. Now** | 1 + 5 | ~3 days | Melt window is open at both campuses. Decline reasons are nearly free. |
| **B. Next** | 2 + 3 | ~4 days | Makes the funnel visible and tells each campus its inquiry target. |
| **C. Then** | 4 | ~4 days + counsel | Highest mission stakes; gated on the income-collection decision. |
| **D. Separate** | 6 | 3 to 6 weeks | Own project, own timeline, starts with `sis_id`. |

Phases A through C total roughly **two weeks** and need no external dependencies.

## Decisions I need before building anything

1. Weekly melt outreach: automated email, or a staff call task with email backup?
2. Gap flag threshold: move from 15pp to the playbook's 10pp?
3. Income and housing collection: post-enrollment only, and does counsel sign off?
4. Which campus uses PowerSchool and which uses Qmlativ?
