# Rooted EMS vs. PB 24 Student Recruitment Playbook v2.2
**Date:** 2026-08-09 · Sources: PB 24 v2.2 (Google Doc), RSF_Recruitment_Workbook.xlsx
**Status:** analysis only. Nothing built. Recommendations for approval.

---

## Headline

The EMS covers Stages 1 through 4 genuinely well. **Stage 5 (Retain) is largely
absent, and the five-stage funnel is not visible anywhere in the app as a single
view.** Nothing here is a rebuild. It is reporting, cadence, and one schema gap.

Second finding, and the more strategic one: **the Workbook is a spreadsheet doing
work the application should be doing.** Tabs 1, 3, 4, and 6 (Funnel Math, KPI
Dashboard, Equity Tracker, Melt Risk Log) are all live-data functions. Tabs 2, 5,
and 8 (Budget, Partner Tracker, Ambassador Roster) are legitimately planning
artifacts and should stay in the workbook.

---

## Stage-by-stage

| Playbook stage | Playbook goal | EMS today | Verdict |
|---|---|---|---|
| 1. Generate Interest | 3× capacity in qualified inquiries | `crm_leads`, `lead_campaigns`, ZIP targeting, events, referrals, ad webhook | **Strong** |
| 2. Engage & Inform | 40%+ inquiry to complete app | `journeys`, campaigns, `reengage-leads`, inbound SMS, event follow-ups | **Strong** |
| 3. Apply | Complete and submit | applications, lottery, waitlist + history | **Strong** |
| 4. Enroll | 95%+ accepted to enrolled | offers, packets, `nudge-registrations`, expiry | **Strong** |
| 5. Retain | <5% melt, 96%+ 30-day, 85%+ re-enrollment | `keep-the-seat` (once), `reenrollment_pulse` | **Weak** |

---

## Gap 1. Summer melt cadence contradicts the playbook (highest stakes)

The playbook v2.2 changelog states the standard was **corrected to WEEKLY**, lottery
day through first day. The Melt Risk Log requires personal outreach every week and
auto-flags any family at **14+ days since last contact**.

The EMS sends the keep-the-seat message **exactly once**. `cron/keep-the-seat`
selects only rows where `keep_the_seat_sent_at IS NULL` and atomically claims each
one, so a family is touched a single time and never again.

This is the sharpest divergence in the system, it maps to the playbook's highest
named risk, and both campuses are entering this window now.

## Gap 2. The funnel is not visible as a funnel

`PIPELINE_STAGES` in `lib/application-helpers.ts` is: needs_review,
ready_for_lottery, offer_out, registering, enrolled, waitlist. That is a **staff
work queue**, not the family journey. It begins after an application exists, so
Generate Interest and Engage & Inform are not in it, and Retain does not appear at
all. Lead-stage work lives separately under `/staff/recruitment`.

Nowhere does a user see the five stages end to end with counts and conversion.

## Gap 3. Only one of nine KPIs is computed

The Workbook KPI Dashboard defines nine targets. `getRecruitmentFunnel` computes
lead-to-application conversion. That is it.

| KPI | Target | In EMS |
|---|---|---|
| Inquiry-to-App Conversion | 50% | Yes |
| App Completion Rate | 85% | No |
| Seat Acceptance Rate | 80% | No |
| Enrollment Rate (accepted→enrolled) | 95% | No |
| Summer Melt Rate | 5% | No (queries exist, no rate) |
| Day 1 Attendance | 95% | No |
| 30-Day Retention | 97% | No |
| Re-enrollment Rate | 90% | No |
| Equity Gap (largest subgroup) | ≤10pp | No |

No GREEN/YELLOW/RED status logic exists.

## Gap 4. No funnel math calculator

Workbook Tab 1 works backward from the authorizer seat target: ÷0.95 melt, ÷0.85
acceptance, ÷0.85 lottery efficiency, ÷0.50 inquiry-to-app, with a 3× stretch and a
1.5× waitlist target. It also carries channel benchmarks (referral 20%, CBO 10%,
digital 6%, cold 5%).

Without this in the app, neither campus knows whether today's lead volume puts them
on pace. With SC and OH recruiting simultaneously, this is the difference between
managing two pipelines and guessing at two pipelines.

## Gap 5. Equity tracking is incomplete, and one field does not exist

The Equity Tracker requires every funnel stage broken out by race, income (FRL vs
full pay), language, disability (IEP vs not), housing (McKinney-Vento), and ZIP
zone, with an automatic flag at >10pp below overall and a written root-cause plan
within 30 days.

The EMS equity surface uses ZIP, language, and race/ethnicity only.

- `student.has_iep` and `has_504` **exist** and are simply unused in reporting.
- **Income/FRL does not exist as a structured field.** It appears only as document
  requirements (`frl_app`, `income_verification`). Income disaggregation is
  therefore impossible today without a schema change.
- McKinney-Vento housing status does not exist.
- No 10pp gap detection, no root-cause workflow.

For a network whose mission is economic mobility, and for authorizer reporting,
this is the gap I would least want to leave open.

## Gap 6. Refusal reasons are not captured

Playbook Section 15 requires post-lottery refusal tracking. The schema has
`offer.revoke_reason` (staff revoking a seat) and `waitlist_position.removal_reason`.
There is no field for **why a family declined**. That is the single highest-value
learning signal in the funnel and it is currently discarded.

---

## Recommended sequence

Ordered by students lost per week of delay, not by effort.

1. **Weekly melt cadence + 14-day risk flag.** Convert keep-the-seat from
   send-once to a weekly loop through first day, add a "days since contact" flag,
   and surface an at-risk list on `/staff/today`. Both campuses are in this window
   now. Small change, immediate stakes.
2. **Five-stage funnel view.** One page showing Generate Interest → Engage &
   Inform → Apply → Enroll → Retain with counts, stage conversion, and
   GREEN/YELLOW/RED against playbook targets. Directly answers "is the funnel
   visible and well represented."
3. **Funnel math calculator.** Seat target in, inquiry and application targets out,
   per campus, with pace-to-target against live counts.
4. **Equity tracker completion.** Add the income/FRL and McKinney-Vento fields,
   wire `has_iep` into reporting, extend disaggregation across all five stages, and
   implement the 10pp auto-flag.
5. **Decline reason capture.** A required reason on family decline, reported by
   campus and subgroup. Cheapest item here and it compounds every cycle.
6. **30-day retention and Day-1 attendance.** These need attendance data, so they
   likely depend on a PowerSchool feed. Scope separately; do not let it block 1-5.

## What I would not do

Do not migrate Budget, Partner Tracker, or Ambassador Roster into the app. Those are
planning and relationship artifacts that belong in the workbook, and forcing them
into software adds maintenance without adding fidelity.
